import { useEffect, useState, useCallback } from 'react';
import { supabase, CalendarEvent } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/**
 * Builds UTC start/end timestamps for a given date.
 * Uses UTC methods to avoid local-timezone day-boundary mismatches.
 */
function getUTCDayBounds(date: Date) {
  // Create a new Date set to midnight UTC on the selected date
  const startOfDay = new Date(Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0, 0, 0, 0
  ));

  // End of day is 23:59:59.999 UTC
  const endOfDay = new Date(Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23, 59, 59, 999
  ));

  return { startOfDay, endOfDay };
}

export function useEvents(selectedDate: Date) {
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Get UTC start and end of day to ensure consistent timezone handling
      const { startOfDay, endOfDay } = getUTCDayBounds(selectedDate);

      // Query events that are active during the selected day:
      // - start_time is before or during the day AND
      // - end_time is during or after the day
      // This catches: single-day events, multi-day events, and events spanning into this day
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('user_id', user.id)
        .lte('start_time', endOfDay.toISOString())   // Event starts before day ends
        .gte('end_time', startOfDay.toISOString())   // Event ends after day starts
        .order('start_time', { ascending: true });

      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  }, [user, selectedDate]);

  useEffect(() => {
    // Guard: only set up subscription when user exists
    if (!user?.id) return;

    fetchEvents();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('events-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'events',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchEvents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchEvents, user?.id]);

  const createEvent = async (event: Partial<CalendarEvent>) => {
    if (!user) return;

    const { error } = await supabase
      .from('events')
      .insert({
        ...event,
        user_id: user.id,
      });

    if (error) throw error;
    await fetchEvents();
  };

  const updateEvent = async (id: string, updates: Partial<CalendarEvent>) => {
    if (!user) return;

    // Security: Only update events owned by the current user
    const { error } = await supabase
      .from('events')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;
    await fetchEvents();
  };

  const deleteEvent = async (id: string) => {
    if (!user) return;

    // Security: Only delete events owned by the current user
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;
    await fetchEvents();
  };

  return {
    events,
    loading,
    refresh: fetchEvents,
    createEvent,
    updateEvent,
    deleteEvent,
  };
}


