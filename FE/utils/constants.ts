import { Option } from '../interface/filterInterface';
import { Event } from '../interface/objects/simpleObject';

export class Constants {
  static delimiter = '|==|';

  static propertyOptions: Option[] = [
    // { value: 'default', label: 'Column Name', disabled: true },
    { value: 'date', label: 'Event Date' },
    { value: 'location', label: 'Event Location' },
    { value: 'artist', label: 'Artist' },
    { value: 'price', label: 'Ticket Price' },
  ];

  static adminPropertyOptions: Option[] = [
    // { value: 'default', label: 'Column Name', disabled: true },
    { value: 'run', label: 'Run' },
    { value: 'date', label: 'Event Date' },
    { value: 'account', label: 'Account' },
  ];

  static conditionOptions: {
    default: Option[];
    date: Option[];
    location: Option[];
    artist: Option[];
    price: Option[];
    account: Option[];
    run: Option[];
  } = {
    default: [{ value: '', label: 'Condition', disabled: true }],
    date: [
      { value: 'between', label: 'Between' },
      { value: 'equal', label: 'is' },
    ],
    location: [{ value: 'equal', label: 'Is' }],
    artist: [{ value: 'equal', label: 'Is' }],
    price: [
      { value: 'between', label: 'Between' },
      { value: 'equal', label: 'Is' },
    ],
    account: [{ value: 'equal', label: 'Is' }],
    run: [{ value: 'equal', label: 'Is' }],
  };

  static conjugationOptions: Option[] = [
    { value: 'and', label: 'And' },
    { value: 'or', label: 'Or' },
  ];

  static accountsFilterOptions: Option[] = [
    { value: 'All', label: 'All' },
    { value: 'Tracking', label: 'Tracking' },
    { value: 'Awaiting Approval', label: 'Awaiting Approval' },
  ];

  static accountSortingOptions: Option[] = [
    { value: '', label: 'None' }, 
    { value: 'name_asc', label: 'Name (A to Z)' },
    { value: 'name_desc', label: 'Name (Z to A)' },
    { value: 'creation_asc', label: 'Date Added (Soonest First)' },
    { value: 'creation_desc', label: 'Date Added (Furthest First)' }
  ];

  static eventsSortingOptions: Option[] = [
    { value: '', label: 'None' }, 
    { value: 'name_asc', label: 'Event Name (A to Z)' },
    { value: 'name_desc', label: 'Event Name (Z to A)' },
    { value: 'start_date_asc', label: 'Start Date (Soonest First)' },
    { value: 'start_date_desc', label: 'Start Date (Furthest First)' },
    { value: 'end_date_asc', label: 'End Date (Soonest First)' },
    { value: 'end_date_desc', label: 'End Date (Furthest First)' },
    { value: 'start_time_asc', label: 'Start Time (Earliest First)' },
    { value: 'start_time_desc', label: 'Start Time (Latest First)' },
    { value: 'end_time_asc', label: 'End Time (Earliest First)' },
    { value: 'end_time_desc', label: 'End Time (Latest First)' },
    { value: 'city_asc', label: 'City (A to Z)' },
    { value: 'city_desc', label: 'City (Z to A)' },
    { value: 'state_asc', label: 'State (A to Z)' },
    { value: 'state_desc', label: 'State (Z to A)' },
    { value: 'country_asc', label: 'Country (A to Z)' },
    { value: 'country_desc', label: 'Country (Z to A)' },
    { value: 'account_asc', label: 'Account (A to Z)' },
    { value: 'account_desc', label: 'Account (Z to A)' },
    { value: 'artist_asc', label: 'Artist (A to Z)' },
    { value: 'artist_desc', label: 'Artist (Z to A)' },
    { value: 'with_opener_asc', label: 'With/Opener (A to Z)' },
    { value: 'with_opener_desc', label: 'With/Opener (Z to A)' },
    { value: 'host_asc', label: 'Host (A to Z)' },
    { value: 'host_desc', label: 'Host (Z to A)' },
    { value: 'promoter_asc', label: 'Promoter (A to Z)' },
    { value: 'promoter_desc', label: 'Promoter (Z to A)' },
    { value: 'address_asc', label: 'Address (A to Z)' },
    { value: 'address_desc', label: 'Address (Z to A)' },
    { value: 'offerings_asc', label: 'Offerings (A to Z)' },
    { value: 'offerings_desc', label: 'Offerings (Z to A)' },
    { value: 'price_asc', label: 'Ticket Price (Lowest First)' },
    { value: 'price_desc', label: 'Ticket Price (Highest First)' },
    { value: 'ticket_link_asc', label: 'Ticket Link (A to Z)' },
    { value: 'ticket_link_desc', label: 'Ticket Link (Z to A)' },
    { value: 'age_asc', label: 'All Ages / 21+ (A to Z)' },
    { value: 'age_desc', label: 'All Ages / 21+ (Z to A)' },
  ];

  static spanishEventsSortingOptions: Option[] = [
    { value: '', label: 'Ninguno' },
    { value: 'name_asc', label: 'Nombre del Evento (A-Z)' },
    { value: 'name_desc', label: 'Nombre del Evento (Z-A)' },
    { value: 'start_date_asc', label: 'Fecha de Inicio (Antes)' },
    { value: 'start_date_desc', label: 'Fecha de Inicio (Más Reciente)' },
    { value: 'end_date_asc', label: 'Fecha de Fin (Antes)' },
    { value: 'end_date_desc', label: 'Fecha de Fin (Más Reciente)' },
    { value: 'start_time_asc', label: 'Hora de Inicio (Antes)' },
    { value: 'start_time_desc', label: 'Hora de Inicio (Más Reciente)' },
    { value: 'end_time_asc', label: 'Hora de Fin (Antes)' },
    { value: 'end_time_desc', label: 'Hora de Fin (Más Reciente)' },
    { value: 'city_asc', label: 'Ciudad (A-Z)' },
    { value: 'city_desc', label: 'Ciudad (Z-A)' },
    { value: 'state_asc', label: 'Estado (A-Z)' },
    { value: 'state_desc', label: 'Estado (Z-A)' },
    { value: 'country_asc', label: 'País (A-Z)' },
    { value: 'country_desc', label: 'País (Z-A)' },
    { value: 'account_asc', label: 'Cuenta (A-Z)' },
    { value: 'account_desc', label: 'Cuenta (Z-A)' },
    { value: 'artist_asc', label: 'Artista (A-Z)' },
    { value: 'artist_desc', label: 'Artista (Z-A)' },
    { value: 'with_opener_asc', label: 'Con/Opener (A-Z)' },
    { value: 'with_opener_desc', label: 'Con/Opener (Z-A)' },
    { value: 'host_asc', label: 'Anfitrión (A-Z)' },
    { value: 'host_desc', label: 'Anfitrión (Z-A)' },
    { value: 'promoter_asc', label: 'Promotor (A-Z)' },
    { value: 'promoter_desc', label: 'Promotor (Z-A)' },
    { value: 'venue_name_asc', label: 'Nombre del Venue (A-Z)' },
    { value: 'venue_name_desc', label: 'Nombre del Venue (Z-A)' },
    { value: 'address_asc', label: 'Dirección (A-Z)' },
    { value: 'address_desc', label: 'Dirección (Z-A)' },
    { value: 'offerings_asc', label: 'Propuestas (A-Z)' },
    { value: 'offerings_desc', label: 'Propuestas (Z-A)' },
    { value: 'price_asc', label: 'Precio de boleto (más bajo primero)' },
    { value: 'price_desc', label: 'Precio de boleto (más alto primero)' },
    { value: 'ticket_link_asc', label: 'Link de la Entrada (A-Z)' },
    { value: 'ticket_link_desc', label: 'Link de la Entrada (Z-A)' },
    { value: 'age_asc', label: 'Todos los Edades / 21+ (A-Z)' },
    { value: 'age_desc', label: 'Todos los Edades / 21+ (Z-A)' },
  ];

static runOptions: Option[] = [
  { value: 'lastRun', label: 'Last Run' },
  { value: 'olderRuns', label: 'Older Runs' },
];

static validStates = [
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
];

static eventsSortingOptionsDashboard: Option[] = [
  // { value: '', label: 'None' },
  { value: 'name_asc', label: 'Event Name (A to Z)' },
  { value: 'name_desc', label: 'Event Name (Z to A)' },
  { value: 'timestamp_asc', label: 'Event Date (Soonest First)' },
  { value: 'timestamp_desc', label: 'Event Date (Furthest First)' },
  //{ value: 'created_at_asc', label: 'Date Added (Soonest First)' },
  //{ value: 'created_at_desc', label: 'Date Added (Furthest First)' },
  { value: 'price_asc', label: 'Ticket Price (Lowest First)' },
  { value: 'price_desc', label: 'Ticket Price (Highest First)' },
 
];

static spanishEventsSortingOptionsDashboard: Option[] = [
  //{ value: '', label: 'Ninguno' },
  { value: 'name_asc', label: 'Nombre del Evento (A-Z)' },
  { value: 'name_desc', label: 'Nombre del Evento (Z-A)' },
  { value: 'timestamp_asc', label: 'Fecha del evento (más próximos primero)' },
  { value: 'timestamp_desc', label: 'Fecha del evento (menos próximos primero)' },
  //{ value: 'created_at_asc', label: 'Fecha añadida (más antiguos primero)' },
  //{ value: 'created_at_desc', label: 'Precio de boleto (más bajo primero)' },
  { value: 'price_asc', label: 'Precio de boleto (más bajo primero)' },
  { value: 'price_desc', label: 'Precio de boleto (más alto primero)' },
];

  static persistenceOptions: Option[] = [
    { value: '1', label: '1 Day' },
    { value: '7', label: '7 Days' },
    { value: '30', label: '30 Days' },
    { value: '60', label: '60 Days' },
    { value: '90', label: '90 Days' },
  ];

  static accountsTableColumns = ['Username', 'Date Added', 'Status'];

  static eventsTableColumns = [
      'Thumbnail',
      'Event Name',
      'Start Date',
      'End Date',
      'Start Time',
      'End Time',
      'City',
      'State',
      'Country',
      'Account',
      'Artist',
      'With/Opener',
      'Host',
      'Promoter',
      'Venue name',
      'Genre(s)',
      'Address',
      'Offerings',
      'Ticket Price',
      'Ticket link',
      'All ages / 21+',
  ];

  static feedbackTableColumns = [
    // 'Thumbnail',
    'Event Name',
    // 'Account',
    'Artist',
    'With/Opener',
    'Host',
    'Promoter',
    // 'Venue name',
    'Address',
    'City',
    'State',
    'Offerings',
    // 'Date',
    'Start Date',
    'End Date',
    'Start Time',
    'End Time',
    'Ticket Price',
    'Ticket link',
    // 'All ages / 21+',
  ];

  static days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  static months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  static readOnlyColumns = [
    'Thumbnail',
    'Account',
    'Date',
    'Time',
  ];

  static keywordColumns: string[] = [
    'Event Name',
    'Event Price',
    'Venue',
    'Location',
    'Event Date',
    'Event Time',
    'Artist',
    'With/Opener',
    'Host',
    'Promoter',
    'Offering',
  ];
}
