import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../stores/authStore';
import { useEvents } from '../hooks/useEvents';
import { CalendarEvent } from '../lib/supabase';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDateHeader(date: Date): string {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === tomorrow.toDateString()) {
    return 'Tomorrow';
  }
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

interface EventBlockProps {
  event: CalendarEvent;
  onPress: () => void;
}

function EventBlock({ event, onPress }: EventBlockProps) {
  const startTime = new Date(event.start_time);
  const endTime = new Date(event.end_time);
  const startHour = startTime.getHours() + startTime.getMinutes() / 60;
  const duration = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);

  const colors = ['#F97316', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899'];
  const colorIndex = event.title.length % colors.length;

  return (
    <TouchableOpacity
      style={[
        styles.eventBlock,
        {
          top: startHour * 60,
          height: Math.max(duration * 60, 30),
          backgroundColor: colors[colorIndex] + '20',
          borderLeftColor: colors[colorIndex],
        },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.eventTitle, { color: colors[colorIndex] }]} numberOfLines={1}>
        {event.title}
      </Text>
      <Text style={styles.eventTime}>
        {formatTime(startTime)} - {formatTime(endTime)}
      </Text>
    </TouchableOpacity>
  );
}

export function HomeScreen() {
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { events, loading, refresh, createEvent, deleteEvent } = useEvents(selectedDate);

  const [modalVisible, setModalVisible] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventStartHour, setNewEventStartHour] = useState(9);

  const handleCreateEvent = async () => {
    if (!newEventTitle.trim()) {
      Alert.alert('Error', 'Please enter an event title');
      return;
    }

    const startTime = new Date(selectedDate);
    startTime.setHours(newEventStartHour, 0, 0, 0);

    const endTime = new Date(startTime);
    endTime.setHours(startTime.getHours() + 1);

    try {
      await createEvent({
        title: newEventTitle,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        all_day: false,
      });
      setModalVisible(false);
      setNewEventTitle('');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleDeleteEvent = (event: CalendarEvent) => {
    Alert.alert(
      'Delete Event',
      `Are you sure you want to delete "${event.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteEvent(event.id),
        },
      ]
    );
  };

  const navigateDate = (direction: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + direction);
    setSelectedDate(newDate);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            Hello, {user?.user_metadata?.full_name?.split(' ')[0] || 'there'}
          </Text>
          <Text style={styles.dateTitle}>{formatDateHeader(selectedDate)}</Text>
        </View>
        <TouchableOpacity style={styles.profileButton} onPress={signOut}>
          <Text style={styles.profileButtonText}>
            {user?.email?.charAt(0).toUpperCase() || '?'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Date Navigation */}
      <View style={styles.dateNav}>
        <TouchableOpacity onPress={() => navigateDate(-1)} style={styles.dateNavButton}>
          <Text style={styles.dateNavText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.dateNavCurrent}>
          {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </Text>
        <TouchableOpacity onPress={() => navigateDate(1)} style={styles.dateNavButton}>
          <Text style={styles.dateNavText}>→</Text>
        </TouchableOpacity>
      </View>

      {/* Calendar Grid */}
      <ScrollView
        style={styles.calendarContainer}
        contentContainerStyle={styles.calendarContent}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#F97316" />
        }
      >
        <View style={styles.calendar}>
          {/* Time column */}
          <View style={styles.timeColumn}>
            {HOURS.map((hour) => (
              <View key={hour} style={styles.timeSlot}>
                <Text style={styles.timeText}>
                  {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                </Text>
              </View>
            ))}
          </View>

          {/* Events column */}
          <View style={styles.eventsColumn}>
            {HOURS.map((hour) => (
              <View key={hour} style={styles.hourLine} />
            ))}
            {events.map((event) => (
              <EventBlock
                key={event.id}
                event={event}
                onPress={() => handleDeleteEvent(event)}
              />
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Add Event FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setModalVisible(true)}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Add Event Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Event</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Event title"
              placeholderTextColor="#8B8B8B"
              value={newEventTitle}
              onChangeText={setNewEventTitle}
            />

            <View style={styles.hourPicker}>
              <Text style={styles.hourPickerLabel}>Start time:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {HOURS.filter(h => h >= 6 && h <= 22).map((hour) => (
                  <TouchableOpacity
                    key={hour}
                    style={[
                      styles.hourOption,
                      newEventStartHour === hour && styles.hourOptionSelected,
                    ]}
                    onPress={() => setNewEventStartHour(hour)}
                  >
                    <Text
                      style={[
                        styles.hourOptionText,
                        newEventStartHour === hour && styles.hourOptionTextSelected,
                      ]}
                    >
                      {hour < 12 ? `${hour}AM` : hour === 12 ? '12PM' : `${hour - 12}PM`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalButtonCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButtonCreate}
                onPress={handleCreateEvent}
              >
                <Text style={styles.modalButtonCreateText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  greeting: {
    fontSize: 14,
    color: '#8B8B8B',
  },
  dateTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F97316',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 24,
  },
  dateNavButton: {
    padding: 8,
  },
  dateNavText: {
    fontSize: 20,
    color: '#F97316',
  },
  dateNavCurrent: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  calendarContainer: {
    flex: 1,
  },
  calendarContent: {
    paddingBottom: 100,
  },
  calendar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
  },
  timeColumn: {
    width: 56,
  },
  timeSlot: {
    height: 60,
    justifyContent: 'flex-start',
    paddingTop: 0,
  },
  timeText: {
    fontSize: 11,
    color: '#6B6B6B',
    textAlign: 'right',
    paddingRight: 8,
  },
  eventsColumn: {
    flex: 1,
    position: 'relative',
    borderLeftWidth: 1,
    borderLeftColor: '#2A2A2A',
  },
  hourLine: {
    height: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  eventBlock: {
    position: 'absolute',
    left: 4,
    right: 4,
    borderRadius: 8,
    borderLeftWidth: 3,
    padding: 8,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  eventTime: {
    fontSize: 11,
    color: '#8B8B8B',
    marginTop: 2,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F97316',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: {
    fontSize: 28,
    color: '#FFFFFF',
    fontWeight: '300',
    marginTop: -2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 20,
  },
  modalInput: {
    backgroundColor: '#0D0D0D',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    marginBottom: 20,
  },
  hourPicker: {
    marginBottom: 24,
  },
  hourPickerLabel: {
    fontSize: 14,
    color: '#8B8B8B',
    marginBottom: 12,
  },
  hourOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#2A2A2A',
    marginRight: 8,
  },
  hourOptionSelected: {
    backgroundColor: '#F97316',
  },
  hourOptionText: {
    fontSize: 14,
    color: '#8B8B8B',
  },
  hourOptionTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButtonCancel: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
  },
  modalButtonCancelText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  modalButtonCreate: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F97316',
    alignItems: 'center',
  },
  modalButtonCreateText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});


