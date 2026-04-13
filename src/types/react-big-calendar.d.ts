declare module "react-big-calendar" {
  import { ComponentType, ReactNode } from "react";

  export type View = "month" | "week" | "work_week" | "day" | "agenda";

  export interface Event {
    id?: string | number;
    title?: string;
    start: Date;
    end: Date;
    allDay?: boolean;
    resource?: unknown;
  }

  export interface SlotInfo {
    start: Date;
    end: Date;
    slots: Date[];
    action: "select" | "click" | "doubleClick";
  }

  export interface CalendarProps<TEvent extends object = Event, TResource extends object = object> {
    localizer: object;
    events?: TEvent[];
    startAccessor?: string | ((event: TEvent) => Date);
    endAccessor?: string | ((event: TEvent) => Date);
    titleAccessor?: string | ((event: TEvent) => string);
    view?: View;
    views?: View[];
    date?: Date;
    onView?: (view: View) => void;
    onNavigate?: (date: Date, view: View) => void;
    onSelectEvent?: (event: TEvent) => void;
    onSelectSlot?: (slotInfo: SlotInfo) => void;
    selectable?: boolean;
    resizable?: boolean;
    draggableAccessor?: string | ((event: TEvent) => boolean);
    style?: React.CSSProperties;
    className?: string;
    children?: ReactNode;
    [key: string]: unknown;
  }

  export const Calendar: ComponentType<CalendarProps>;
  export function momentLocalizer(moment: unknown): object;
  export function dateFnsLocalizer(config: unknown): object;
}

declare module "react-big-calendar/lib/addons/dragAndDrop" {
  import { ComponentType } from "react";
  import { CalendarProps, Event } from "react-big-calendar";

  export interface EventInteractionArgs<TEvent extends object = Event> {
    event: TEvent;
    start: Date | string;
    end: Date | string;
    isAllDay?: boolean;
  }

  export default function withDragAndDrop<TEvent extends object = Event>(
    Calendar: ComponentType<CalendarProps<TEvent>>
  ): ComponentType<CalendarProps<TEvent> & {
    onEventDrop?: (args: EventInteractionArgs<TEvent>) => void;
    onEventResize?: (args: EventInteractionArgs<TEvent>) => void;
    resizable?: boolean;
    draggableAccessor?: string | ((event: TEvent) => boolean);
  }>;
}
