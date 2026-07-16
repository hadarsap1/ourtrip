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
export type Checklist = Tables<"checklists">;
export type ChecklistItem = Tables<"checklist_items">;

export type ItemStatus = Enums<"item_status">;
export type BookingType = Enums<"booking_type">;
export type BookingStatus = Enums<"booking_status">;
