import type { Enums, Tables } from "./database.types";

export type Trip = Tables<"trips">;
export type Member = Tables<"members">;
/** Name-only projection of a member — no email (audit P-2). What every screen
 *  that resolves an id into a label should use. */
export type MemberName = Tables<"trip_member_names">;
export type ItineraryDay = Tables<"itinerary_days">;
export type ItineraryItem = Tables<"itinerary_items">;
export type Booking = Tables<"bookings">;
export type BudgetCategory = Tables<"budget_categories">;
export type Expense = Tables<"expenses">;
export type Document = Tables<"documents">;
export type EmergencyInfo = Tables<"emergency_info">;
export type MapPin = Tables<"map_pins">;
export type SavedRoute = Tables<"routes">;
export type PhrasebookEntry = Tables<"phrasebook_entries">;
export type Checklist = Tables<"checklists">;
export type ChecklistItem = Tables<"checklist_items">;
export type SavedRecommendation = Tables<"saved_recommendations">;
export type SavedLink = Tables<"saved_links">;

export type ItemStatus = Enums<"item_status">;
export type BookingType = Enums<"booking_type">;
export type BookingStatus = Enums<"booking_status">;
