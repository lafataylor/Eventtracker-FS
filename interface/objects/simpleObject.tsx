export interface Account {
  id: number;
  is_personal: boolean;
  created_at: string;
  // same c_admin_account.user column as Poster.user; null=True in the API
  user: string | null;
  status: string;
  forLocation?: string;
}

export interface Log {
  id: number;
  number_of_accounts: number;
  number_of_new_images: number;
  number_of_new_events: number;
  scraped_at: string;
  scraped_by: string;
  accounts_list: string;
  exec_id: string;
  status: string;
  message: string;
}

export interface Keywords {
  'Event Name': string[];
  'Event Price': string[];
  Venue: string[];
  Location: string[];
  'Event Date': string[];
  'Event Time': string[];
  Artist: string[];
  'With/Opener': string[];
  Host: string[];
  Promoter: string[];
  Offering: string[];
}

export interface KeywordColActivations {
  'Event Name': boolean;
  'Event Price': boolean;
  Venue: boolean;
  Location: boolean;
  'Event Date': boolean;
  'Event Time': boolean;
  Artist: boolean;
  'With/Opener': boolean;
  Host: boolean;
  Promoter: boolean;
  Offering: boolean;
}

export interface Venue {
  id: number;
  // Every one of these is null=True in the API and frequently null in the
  // data — address alone is NULL on 44,137 of 73,519 venue rows. Typing them
  // as plain strings is what let the 2026-09-01 crashes typecheck cleanly.
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
}

export interface Poster {
  forLocation?: string;
  id: number;
  // Account.user is null=True; no production row is null today, but the type
  // should say what the API can send, not what it happens to send.
  user: string | null;
  is_personal: true;
  created_at: string;
}

export interface Event {
  id: number;
  name: string | null;
  artist: string | null;
  opener: string | null;
  host: string | null;
  promoter: string | null;
  offering: string | null;
  timestamp: string;
  created_at: string;
  date: string;
  time: string;
  //startDate: string;
  start_date: string;
  //startTime: string;
  start_time: string | null;
  //endDate: string;
  end_date: string;
  //endTime: string;
  end_time: string;
  venue: Venue;
  price: string | null;
  ticket_link: string | null;
  is_age_restricted: boolean;
  orig_link: string;
  orig_thumb: string;
  poster: Poster;
  is_event: boolean;
  age_barrier: string;
  late: boolean;
  link_in_bio: boolean;
  rsvp_required: boolean;
  num_events: number;
  genres: string | null;
  is_blurred: boolean;
  is_favorite: boolean;
  viewing_language?: string;
  is_duplicate?: boolean;
  duplicate_link?: string;
  forLocation?: string;
}

export interface Feedback {
  id: number;
  text: string;
  created_at: string;
  email: string;
  first_name: string;
  last_name: string;
}

export interface Error {
  status_code: number;
  status: string;
  message: string;
}

export interface FeedbackError {
  id: string;
  field_name: string;
  current: string;
  correction: string;
}

export interface ReportedError {
  id: number;
  event: Event;
  created_at: string;
  changes: string;
}

export interface ActionDialogProps {
  title: string;
  body: string;
  buttons: {
    type: 'submit' | 'cancel' | 'delete';
    label: string;
    onClick: Function;
  }[];
}
