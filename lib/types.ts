import type { Enums, Tables } from "./database.types";

export type Trip = Tables<"trips">;
export type Member = Tables<"members">;
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
export type DestinationFact = Tables<"destination_facts">;
export type Checklist = Tables<"checklists">;
export type ChecklistItem = Tables<"checklist_items">;
export type SavedRecommendation = Tables<"saved_recommendations">;
export type SavedLink = Tables<"saved_links">;
export type PlaceOption = Tables<"place_options">;

/** place_options.status is a text column with a CHECK constraint rather than a
 *  PG enum, so the union lives here (see 00020_place_options.sql). */
export type PlaceOptionStatus =
  | "option"
  | "shortlist"
  /** On a day: the option became an itinerary item (migration 00029). */
  | "planned"
  | "booked"
  | "rejected";

export type ItemStatus = Enums<"item_status">;
export type BookingType = Enums<"booking_type">;
export type BookingStatus = Enums<"booking_status">;
