import { Event } from '../interface/objects/simpleObject';
import { Constants } from './constants';
import Cookies from 'js-cookie';


export const formatDate = (date: Date) => {
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear();

  return `${month}/${day}/${year}`;
};

export const formatLongDate = (date: Date) => {
  const month = Constants.months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();

  return `${month} ${day}, ${year}`;
};

export const formatTime = (date: Date) => {
  const hour = (date.getHours() % 13).toString().padStart(2, '0');
  const minute = date.getMinutes().toString().padStart(2, '0');
  const AMOrPM = date.getHours() > 12 ? 'PM' : 'AM';

  return `${hour}:${minute} ${AMOrPM}`;
};


export const format24HrTime = (date: Date) => {
  const hour = date.getHours().toString().padStart(2, '0');
  const minute = date.getMinutes().toString().padStart(2, '0');

  return `${hour}:${minute}`;
};

export const makeSlugFromName = (name: string) => {
  name = name.toLowerCase();
  name = name.replaceAll(' ', '');

  return name;
};


export const checkTokenExpiredStatus = (isAdmin: boolean): boolean => {
  // Determine the cookie names based on user type
  const expiryName = isAdmin ? 'adminTokenExpiry' : 'userTokenExpiry';

  // Get the expiry time from cookies
  const tokenExpiry = Cookies.get(expiryName);

  if (tokenExpiry) {
    const currentTime = new Date().getTime();
    const expiryTime = parseInt(tokenExpiry, 10);

    // Check if the current time is greater than or equal to the expiry time
    return currentTime >= expiryTime;
  }

  // If there's no expiry time cookie, assume the token is expired
  return true;
};
export const getProperty = (fieldName: string) => {
  if (fieldName == 'Event Name') {
    return ['name'];
  } else if (fieldName == 'Artist') {
    return ['artist'];
  } else if (fieldName == 'With/Opener') {
    return ['opener'];
  } else if (fieldName == 'Host') {
    return ['host'];
  } else if (fieldName == 'Promoter') {
    return ['promoter'];
  } else if (fieldName == 'Venue name') {
    return ['venue', 'name'];
  } else if (fieldName == 'Genre(s)') {
    return ['genres'];
  } else if (fieldName == 'Address') {
    return ['venue', 'address'];
  } else if (fieldName == 'City') {
    return ['venue', 'city'];
  } else if (fieldName == 'State') {
    return ['venue', 'state'];
  } else if (fieldName == 'Offerings') {
    return ['offering'];
  } else if (fieldName == 'Ticket Price') {
    return ['price'];
  }else if (fieldName == 'Start Time') {
    return ['start_time'];
  }else if (fieldName == 'End Time') {
    return ['end_time'];
  }else if (fieldName == 'Start Date') {
    return ['start_date'];
  }else if (fieldName == 'End Date') {
    return ['end_date'];
  }else if (fieldName == 'Ticket link') {
    return ['ticket_link'];
  }

  return [];
};
export const getFormattedDate = (d: string) => {
  if (d) {
    const date = new Date(d);
    if (isNaN(date.getTime())) return '';

    const formattingOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    };

    return date.toLocaleDateString('en-US', formattingOptions);
  }

  return '';
};

export const getValueFromColumnName = (event: Event, column: string) => {
  if (typeof column == 'object') {
    column = column[0];
  }

  switch (column) {
    case 'Event Name':
      return event.name;
    case 'Account':
      return event.poster.user;
    case 'Artist':
      return event.artist;
    case 'With/Opener':
      return event.opener;
    case 'Host':
      return event.host;
    case 'Promoter':
      return event.promoter;
    case 'Venue name':
      return event.venue.name;
    case 'Genre(s)':
      return event.genres;
    case 'Address':
      return event.venue.address;
    case 'City':
      return event.venue.city;
    case 'State':
      return event.venue.state;
    case 'Country':
      return event.venue.country;
    case 'Offerings':
      return event.offering;
    case 'Date':
      return formatDate(new Date(event.timestamp));
    case 'Time':
      return formatTime(new Date(event.timestamp));
    case 'Start Date':
      return getFormattedDate(event.start_date);
    case 'Start Time':
      return  event.start_time;
    case 'End Date':
      return getFormattedDate(event.end_date);
    case 'End Time':
      return  event.end_time;
    case 'Ticket Price':
      return event.price
        ? `$${parseFloat(event.price.replace('$', '')).toFixed(2)}`
        : '';
    case 'Ticket link':
      return event.ticket_link;
    case 'All ages / 21+':
      return event.age_barrier ? event.age_barrier.toString() : "";
    default:
      return 'N/A';
  }
};

export const getValueFromColumnNameForFeedback = (event: Event, column: string) => {
  if (typeof column == 'object') {
    column = column[0];
  }

  switch (column) {
    case 'Event Name':
      return event.name;
    case 'Account':
      return event.poster.user;
    case 'Artist':
      return event.artist;
    case 'With/Opener':
      return event.opener;
    case 'Host':
      return event.host;
    case 'Promoter':
      return event.promoter;
    case 'Venue name':
      return event.venue.name;
    case 'Genre(s)':
      return event.genres;
    case 'Address':
      return event.venue.address;
    case 'City':
      return event.venue.city;
    case 'State':
      return event.venue.state;
    case 'Country':
      return event.venue.country;
    case 'Offerings':
      return event.offering;
    case 'Date':
      return formatDate(new Date(event.start_date));
    case 'Time':
      return event.start_time;
    case 'Start Date':
      return formatDate(new Date(event.start_date));
    case 'Start Time':
      return  event.start_time;
    case 'End Date':
      return formatDate(new Date(event.end_date));
    case 'End Time':
      return  event.end_time;
    case 'Ticket Price':
      return event.price ? `$${parseFloat(event.price).toFixed(2)}` : '';
    case 'Ticket link':
      return event.ticket_link;
    case 'All ages / 21+':
      return event.age_barrier ? event.age_barrier.toString() : "";
    default:
      return 'N/A';
  }
};

export const columnNameToProperty = (propertyName: string) => {
  switch (propertyName) {
    case 'Event Name':
      return 'name';
    case 'Account':
      return 'poster,user';
    case 'Artist':
      return 'artist';
    case 'With/Opener':
      return 'opener';
    case 'Host':
      return 'host';
    case 'Promoter':
      return 'promoter';
    case 'Venue name':
      return 'venue,name';
    case 'Genre(s)':
      return 'genres';
    case 'Address':
      return 'venue,address';
    case 'City':
      return 'venue,city';
    case 'State':
      return 'venue,state';
    case 'Country':
      return 'venue,country';
    case 'Offerings':
      return 'offering';
    case 'Date':
      return 'timestamp';
    case 'Start Date':
      return 'start_date';
    case 'Start Time':
      return 'start_time';
    case 'End Date':
      return 'end_date';
    case 'End Time':
      return 'end_time';
    case 'Time':
      return 'timestamp';
    case 'Ticket Price':
      return 'price';
    case 'Ticket link':
      return 'ticket_link';
    case 'All ages / 21+':
      return 'age';
    default:
      return '';
  }
};

export const columnNameToValue = (propertyName: string) => {
  switch (propertyName) {
    case 'Event Name':
      return 'name';
    case 'Account':
      return 'poster,user';
    case 'Artist':
      return 'artist';
    case 'With/Opener':
      return 'opener';
    case 'Host':
      return 'host';
    case 'Promoter':
      return 'promoter';
    case 'Venue name':
      return 'venue';
    case 'Genre(s)':
      return 'genres';
    case 'Address':
      return 'venue,address';
    case 'City':
      return 'venue,city';
    case 'State':
      return 'venue,state';
    case 'Country':
      return 'venue,country';
    case 'Offerings':
      return 'offering';
    case 'Date':
      return 'timestamp';
    case 'Start Date':
      return 'start_date';
    case 'Start Time':
      return 'start_time';
    case 'End Date':
      return 'end_date';
    case 'End Time':
      return 'end_time';
    case 'Time':
      return 'timestamp';
    case 'Ticket Price':
      return 'price';
    case 'Ticket link':
      return 'ticket_link';
    case 'All ages / 21+':
      return 'age';
    default:
      return '';
  }
};


export const convertTo24Hr = (timeString: string) => {
  const [time, modifier] = timeString.split(' ');
  let [hours, minutes] = time.split(':');
  if (hours === '12') {
    hours = '00';
  }
  if (modifier === 'PM') {
    hours = (parseInt(hours, 10) + 12).toString();
  }
  return `${hours}:${minutes}`;
};


export const columnNameToSortOption = (propertyName: string, sortOrder: string): string => {
  const columnToSortMap: { [key: string]: string } = {
    "Event Name": "name",
    "Start Date": "start_date",
    "End Date": "end_date",
    "Start Time": "start_time",
    "End Time": "end_time",
    "City": "city",
    "State": "state",
    "Country": "country",
    "Account": "account",
    "Artist": "artist",
    "With/Opener": "with_opener",
    "Host": "host",
    "Promoter": "promoter",
    "Address": "address",
    "Offerings": "offerings",
    "Ticket Price": "price",
    "Ticket link": "ticket_link",
    "All ages / 21+": "age"
  }
  
  const property = columnToSortMap[propertyName] || '';
  if (property && sortOrder) {
    return `${property}_${sortOrder}`;
  }
  return '';
};
export const sortNameToColumnName = (propertyName: string): string => {
  const columnToSortMap: { [key: string]: string } = {
    'name': 'Event Name',
    'start_date': 'Start Date',
    'end_date': 'End Date',
    'start_time': 'Start Time',
    'end_time': 'End Time',
    'city': 'City',
    'state': 'State',
    'country': 'Country',
    'account': 'Account',
    'artist': 'Artist',
    'with_opener': 'With/Opener',
    'host': 'Host',
    'promoter': 'Promoter',
    'address': 'Address',
    'offerings': 'Offerings',
    'price': 'Ticket Price',
    'ticket_link': 'Ticket link',
    'age': 'All ages / 21+'
  };

  const property = columnToSortMap[propertyName] || '';
  if (property) {
    return `${property}`;
  }
  return '';
};

export const matchSortNameToColumnName = (sortBy: string, selectedColumn: string): boolean => {
  const columnToSortMap: { [key: string]: string } = {
    'name': 'Event Name',
    'start_date': 'Start Date',
    'end_date': 'End Date',
    'start_time': 'Start Time',
    'end_time': 'End Time',
    'city': 'City',
    'state': 'State',
    'country': 'Country',
    'account': 'Account',
    'artist': 'Artist',
    'with_opener': 'With/Opener',
    'host': 'Host',
    'promoter': 'Promoter',
    'address': 'Address',
    'offerings': 'Offerings',
    'price': 'Ticket Price',
    'ticket_link': 'Ticket link',
    'age': 'All ages / 21+'
  };

  // Get the column part from sortBy (e.g., 'name' from 'name_asc')
  const [propertyName] = sortBy.split('_');
  
  // Map the property name to the column name
  const property = columnToSortMap[propertyName];
  
  // Return true if the property is not found or matches the selected column
  return !property || property === selectedColumn;
};

export const isStateCode = (location: String) =>
  Constants.validStates.includes(location.toUpperCase());

export const formatLocationSlug = (slug: string): string => {
  if (!slug) return '';
  if (slug === 'general') return 'General';
  return slug
    .replace(/-/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export const normalizeLocationSlug = (slug: string): string =>
  slug.toLowerCase().replace(/[-\s]/g, '');

export const extractLocationsFromEvents = (events: Event[]): string[] => {
  const locs = new Set<string>();

  for (const event of events) {
    const raw = event.forLocation || event.poster?.forLocation;
    if (!raw) continue;

    raw.split(',').forEach((part) => {
      const trimmed = part.trim();
      if (trimmed) locs.add(trimmed);
    });
  }

  return Array.from(locs).sort();
};
