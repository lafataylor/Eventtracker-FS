import React from 'react';
import Home from '../../';
import { useRouter } from 'next/router';
import {
  hideLoadingDialog,
  showLoadingDialog,
} from '../../../store/actions/loadingState';
import { useStore } from '../../../store/store';
import EventService from '../../../services/lib/event';
import { Event } from '../../../interface/objects/simpleObject';
import { showEvent } from '../../../store/actions/eventDetailsDialog';
import Head from 'next/head';

const EventDetailsPage = ({ event }: { event: Event | null }) => {
  const [, dispatch] = useStore();
  const router = useRouter();

  React.useEffect(() => {
    if (event) {
      showEvent(event)(dispatch);
    }
  }, [event, dispatch]);

  return (
    <>
      {event ? (
        <Head>
          <title>{event.name}</title>
          <meta property="og:title" content={"lafaslist"} />
          <meta property="og:image" content={event.orig_thumb} />
          <meta property="og:description" content={`Check out this event on lafaslist!: ${event.name}`} />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content={"lafaslist"} />
          <meta name="twitter:image" content={event.orig_thumb} />
          <meta name="twitter:description" content={`Check out this event on lafaslist!: ${event.name}`} />
        </Head>
      ) : (
        <Head>
          <title>Loading...</title>
        </Head>
      )}
      <div>
        <Home />
      </div>
    </>
  );
};

export const getServerSideProps = async (context: { params: { id: string } }) => {
  const { id } = context.params;
  let event: Event | null = null;

  try {
    const res = await EventService.getEvent({ id });
    if (res.status === 200) {
      event = res.data as Event;
    }
  } catch (error) {
    console.error('Error fetching event:', error);
  }

  return {
    props: {
      event,
    },
  };
};

export default EventDetailsPage;
