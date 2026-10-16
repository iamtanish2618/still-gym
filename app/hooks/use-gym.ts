import { useApi } from "./use-api";
import { useAuthentication } from "./use-authentication";
import { useBookingActions } from "./use-booking-actions";
import { useGymState } from "./use-gym-state";
import { useNavigation } from "./use-navigation";
import { useRoster } from "./use-roster";
import { useSchedule } from "./use-schedule";
import { useStaffActions } from "./use-staff-actions";
export function useGym() {
  const state = useGymState();
  useNavigation(state);
  const { api } = useApi(state);
  const auth = useAuthentication({ ...state, api });
  const { load } = useSchedule({ ...state, api });
  const { loadRoster } = useRoster({ ...state, api });
  const bookingActions = useBookingActions({ ...state, api, load });
  const staffActions = useStaffActions({ ...state, api, load, loadRoster });
  const now = state.clock + state.serverOffset;
  const active = state.bookings.filter(
    (b) =>
      b.status !== "cancelled" &&
      b.start + 3600000 > now &&
      (b.status !== "waitlisted" || b.start > now),
  );
  return {
    ...state,
    ...auth,
    ...bookingActions,
    ...staffActions,
    load,
    loadRoster,
    now,
    active,
  };
}
export type GymModel = ReturnType<typeof useGym>;
