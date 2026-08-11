// Create User
export interface CreateUserRequest {
  users: {
    user: string;
    is_personal: boolean;
    forLocation?: string;
  }[];
}

export interface CreateUserSuccessResponse {
  id: number;
  user: string;
  is_personal: boolean;
  created_at: string;
}

export interface DeleteAccountsRequest {
  accounts: string[];
}

// Delete User
export interface DeleteUserRequest {
  id: string;
}

export interface DeleteUserSuccessResponse {
  status_code: number;
  status: string;
}

export interface DeleteEventsRequest {
  events: string[];
}

export interface UpdateEventRequest {
  id: number;
  event: any;
}

// Update Preference
export interface UpdatePreferenceRequest {
  use: string;
  persistence_day_count: number;
  prompt: string;
}

export interface ReadSystemLogsRequest {
  last_fetched?: number;
}

export interface UpdateKeywordsRequest {
  column_name: string;
  keywords: string[];
}

export interface UpdateLastSeenErrorRequest {
  last_seen_error: number;
}

export interface ResolveErrorRequest {
  id: number;
}

export interface RunScraperRequest {
  accounts: string[];
}

// Account Details
export type DetailMode = 'enforce' | 'fallback';

export type DetailFieldName =
  | 'venue_name'
  | 'venue_city'
  | 'venue_state'
  | 'venue_country'
  | 'venue_address'
  | 'name'
  | 'artist'
  | 'price'
  | 'age_barrier'
  | 'ticket_link'
  | 'forLocation'
  | 'genres';

export interface AccountDetail {
  id: number;
  account: number;
  account_username: string;
  field_name: DetailFieldName;
  value: string;
  mode: DetailMode;
  created_at: string;
  updated_at: string;
}

export interface CreateAccountDetailRequest {
  account_id: number;
  field_name: DetailFieldName;
  value: string;
  mode: DetailMode;
}

export interface UpdateAccountDetailRequest {
  id: number;
  value?: string;
  mode?: DetailMode;
}

export interface DeleteAccountDetailRequest {
  id: number;
}

export interface DetailFieldOption {
  value: DetailFieldName;
  label: string;
}
