import { useEffect, useState, useCallback } from 'react';
import { supabase, CalendarEvent } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

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
  const user = useAuthStore((state) => state.user);
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

    // First insert into Supabase to get the event ID
    const { data: insertedEvent, error } = await supabase
      .from('events')
      .insert({
        ...event,
        user_id: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    // Then push to Google Calendar via backend API
    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;

      if (accessToken && BACKEND_URL && insertedEvent) {
        const response = await fetch(`${BACKEND_URL}/api/sync/events`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify(insertedEvent),
        });

        if (response.ok) {
          const result = await response.json();
          // Update the event with the Google Event ID
          if (result.googleEventId) {
            await supabase
              .from('events')
              .update({ google_event_id: result.googleEventId })
              .eq('id', insertedEvent.id);
          }
        } else {
          console.error('Failed to push event to Google Calendar');
        }
      }
    } catch (syncError) {
      console.error('Error syncing event to Google:', syncError);
      // Don't throw - the event is saved in Supabase, just not synced to Google
    }

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

    // First get the event to check for google_event_id
    const { data: eventToDelete } = await supabase
      .from('events')
      .select('google_event_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    // Delete from Google Calendar via backend API if it has a google_event_id
    if (eventToDelete?.google_event_id && BACKEND_URL) {
      try {
        const session = await supabase.auth.getSession();
        const accessToken = session.data.session?.access_token;

        if (accessToken) {
          await fetch(`${BACKEND_URL}/api/sync/events/${id}`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ googleEventId: eventToDelete.google_event_id }),
          });
        }
      } catch (syncError) {
        console.error('Error deleting event from Google:', syncError);
        // Continue with local delete even if Google sync fails
      }
    }

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


