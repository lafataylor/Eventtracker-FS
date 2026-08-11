import EventsSection from '../../components/Dashboard/EventsSection';
import EventDetails from '../../components/Dashboard/EventDetails';
import Link from 'next/link';
import { useStore } from '../../store/store';
import { Event } from '../../interface/objects/simpleObject';
import React, { useState, useEffect } from 'react';
import { ApifyClient } from 'apify-client';
import Spinner from '../../components/Spinner';

const ExperimentalResultsPage = () => {
  const [state, dispatch] = useStore();
  const { experimental } = state;
  const [events, setEvents] = useState<Event[]>([]);
  const [loaded, setLoaded] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [launched, setLaunched] = useState(0);

  let newEvents: Event[] = [];

  const addEvent = (event: Event) => {
    setEvents([...events, event]);
  };

  const client = new ApifyClient({
    token: process.env.NEXT_PUBLIC_APIFY_API_KEY,
  });

  const daysOfWeek = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];

  const formatDate = (inputDate: string) => {
    if (inputDate == null) {
      return '...';
    }

    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    const [month, day, year] = inputDate.split('-').map(Number);
    const monthName = months[month - 1];

    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = daysOfWeek[dateObj.getDay()];

    const formattedDate = `${dayOfWeek}, ${monthName} ${day}, ${year}`;

    return formattedDate;
  };

  const fetchEvents = async (client: ApifyClient, username: string) => {
    const input = {
      username: [username],
      resultsLimit: 5,
    };

    const inputDos = {
      usernames: [username],
    };

    let biography = '';
    let externalUrl = '';

    try {
      // Run the Actor and wait for it to finish

      //console.log('Launching bio fetcher....');

      const runDos = await client
        .actor('apify/instagram-profile-scraper')
        .call(inputDos);

      let { items } = await client.dataset(runDos.defaultDatasetId).listItems();

      items.forEach((item) => {
        console.dir('Bio results: ', item);
        //console.log(item);
        biography = item.biography as string;

        if (item.externalUrl != null) {
          externalUrl = item.externalUrl as string;
        }

        //console.log('Bio is now: ', biography);
        //console.log('Ext url: ', externalUrl);
      });

      items = [];

      //console.log('Launching post fetcher....');

      const run = await client
        .actor('apify/instagram-post-scraper')
        .call(input);

      // Fetch and print Actor results from the run's dataset (if any)
      //console.log('Results from dataset');
      let { items: newItems } = await client
        .dataset(run.defaultDatasetId)
        .listItems();

      const promises = newItems.flatMap(async (item: any, index: number) => {
        if (item.type == 'Sidecar') {
          setLaunched((prevLaunched) => prevLaunched + item.images.length);
        } else if (item.type == 'Image') {
          setLaunched((prevLaunched) => prevLaunched + 1);
        }
        return new Promise((resolve) => {
          setTimeout(async () => {
            console.dir(item);

            const caption = item.caption;

            if (item.type == 'Sidecar') {
              const subPromises = item.images.flatMap(
                async (image: any, index: number) => {
                  return new Promise((resolve) => {
                    setTimeout(async () => {
                      const overallComponent = {
                        baseImageURL: image,
                        caption: caption,
                        biography: biography,
                        externalLink: externalUrl,
                      };

                      //fetch(`/api/getImage/${encodeURIComponent(image)}`)
                      fetch(
                        `/api/getImage/${encodeURIComponent(
                          JSON.stringify(overallComponent)
                        )}`
                      )
                        .then((response) => {
                          return response.json();
                        })
                        .then((responseBody) => {
                          const extractedData =
                            responseBody.extractedData.choices[0].message
                              .content;

                          const extractedJSON = JSON.parse(
                            extractedData.replace(/```json|```|\n/g, '')
                          );

                          if (extractedJSON.num_events == 1) {
                            /*newEvents = [...newEvents, {
                            id: 2,
                            venue: {
                              id: 5,
                              name: extractedJSON.venue,
                              address: extractedJSON.overallAddress,
                              city: extractedJSON.city,
                              state: extractedJSON.state,
                              country: extractedJSON.country,
                            },
                            name: extractedJSON.eventName,
                            artist: extractedJSON.artist.join(", "),
                            opener: extractedJSON.openers.join(", "),
                            host: extractedJSON.hosts.join(", "),
                            promoter: extractedJSON.promoters.join(", "),
                            offering: extractedJSON.offerings.join(", "),
                            timestamp: '2022-11-07T10:41:47.157839Z',
                            date: formatDate(extractedJSON.startDate),
                            time: extractedJSON.startTime,
                            startDate: formatDate(extractedJSON.startDate),
                            endDate: formatDate(extractedJSON.endDate),
                            startTime: extractedJSON.startTime,
                            endTime: extractedJSON.endTime,
                            price: extractedJSON.ticketPrice,
                            ticket_link: extractedJSON.ticketLink,
                            is_age_restricted: false,
                            orig_link: 'dummy_origlink1',
                            orig_thumb: responseBody.imageData,
                            poster: {user: "@"+username},
                            is_event: extractedJSON.is_event,
                            age_barrier: extractedJSON.age_barrier,
                            late: extractedJSON.late,
                            link_in_bio: extractedJSON.link_in_bio,
                            rsvp_required: extractedJSON.rsvp_required,
                            num_events: extractedJSON.num_events
                          } as Event];*/
                          } else {
                            /*extractedJSON.subEvents.forEach((subEvent: any, index: number) => {
                            newEvents = [...newEvents, {
                              id: 2,
                              venue: {
                                id: 5,
                                name: subEvent.venue,
                                address: subEvent.overallAddress,
                                city: subEvent.city,
                                state: subEvent.state,
                                country: subEvent.country,
                              },
                              name: subEvent.eventName,
                              artist: subEvent.artist.join(", "),
                              opener: subEvent.openers.join(", "),
                              host: subEvent.hosts.join(", "),
                              promoter: subEvent.promoters.join(", "),
                              offering: subEvent.offerings.join(", "),
                              timestamp: '2022-11-07T10:41:47.157839Z',
                              date: formatDate(subEvent.startDate),
                              time: subEvent.startTime,
                              startDate: formatDate(subEvent.startDate),
                              endDate: formatDate(subEvent.endDate),
                              startTime: subEvent.startTime,
                              endTime: subEvent.endTime,
                              price: subEvent.ticketPrice,
                              ticket_link: subEvent.ticketLink,
                              is_age_restricted: false,
                              orig_link: 'dummy_origlink1',
                              orig_thumb: responseBody.imageData,
                              poster: {user: "@"+username},
                              is_event: subEvent.is_event,
                              age_barrier: subEvent.age_barrier,
                              late: subEvent.late,
                              link_in_bio: subEvent.link_in_bio,
                              rsvp_required: subEvent.rsvp_required,
                              num_events: subEvent.num_events
                            } as Event];
                          });*/
                          }

                          setEvents(newEvents);
                          setProcessed((prevProcessed) => prevProcessed + 1);
                        })
                        .catch((error) => {
                          //console.log('error datum: ', error);
                          setProcessed((prevProcessed) => prevProcessed + 1);
                        });
                    }, index * 30000);
                  });
                }
              );

              await Promise.all(subPromises.flat());

              /*for(const image in item.images){
                  //console.log("An image: ",item.images[image])

                  fetch(`/api/getImage/${encodeURIComponent(item.images[image])}`) 
                  .then((response) => {
                    //console.log("success response: ",response)
                    return response.json()
                  })
                  .then((responseBody) => {
                    //console.log("success data: ",responseBody)

                    const extractedData = responseBody.extractedData.choices[0].message.content

                    const extractedJSON = JSON.parse(extractedData.replace(/```json|```|\n/g, ''))

                    //console.log("Extracted data: ", extractedJSON)

                    newEvents = [...newEvents, {
                      id: 2,
                      venue: {
                        id: 5,
                        name: extractedJSON.venue,
                        address: extractedJSON.address,
                        city: extractedJSON.city,
                        state: extractedJSON.state,
                        country: extractedJSON.country,
                      },
                      name: extractedJSON.eventName,
                      artist: extractedJSON.artist.join(", "),
                      opener: extractedJSON.openers.join(", "),
                      host: extractedJSON.hosts.join(", "),
                      promoter: extractedJSON.promoters.join(", "),
                      offering: extractedJSON.offerings.join(", "),
                      timestamp: '2022-11-07T10:41:47.157839Z',
                      date: formatDate(extractedJSON.startDate),
                      time: extractedJSON.startTime,
                      price: extractedJSON.ticketPrice,
                      ticket_link: extractedJSON.ticketLink,
                      is_age_restricted: false,
                      orig_link: 'dummy_origlink1',
                      orig_thumb: responseBody.imageData,
                      poster: {user: "@"+username},
                      is_event: extractedJSON.is_event
                    } as Event];

                    setEvents(newEvents);
                  }).catch((error) => {
                    //console.log("error datum: ",error)
                  })
                }*/
            } else if (item.type == 'Image') {
              const overallComponent = {
                baseImageURL: item.displayUrl,
                caption: caption,
              };

              await fetch(
                `/api/getImage/${encodeURIComponent(
                  JSON.stringify(overallComponent)
                )}`
              )
                .then((response) => {
                  //console.log('success response: ', response);
                  return response.json();
                })
                .then((responseBody) => {
                  //console.log('success data: ', responseBody);

                  const extractedData =
                    responseBody.extractedData.choices[0].message.content;

                  const extractedJSON = JSON.parse(
                    extractedData.replace(/```json|```|\n/g, '')
                  );

                  //console.log('Extracted data: ', extractedJSON);

                  if (extractedJSON.num_events == 1) {
                    /*newEvents = [...newEvents, {
                      id: 2,
                      venue: {
                        id: 5,
                        name: extractedJSON.venue,
                        address: extractedJSON.overallAddress,
                        city: extractedJSON.city,
                        state: extractedJSON.state,
                        country: extractedJSON.country,
                      },
                      name: extractedJSON.eventName,
                      artist: extractedJSON.artist.join(", "),
                      opener: extractedJSON.openers.join(", "),
                      host: extractedJSON.hosts.join(", "),
                      promoter: extractedJSON.promoters.join(", "),
                      offering: extractedJSON.offerings.join(", "),
                      timestamp: '2022-11-07T10:41:47.157839Z',
                      date: formatDate(extractedJSON.startDate),
                      time: extractedJSON.startTime,
                      startDate: formatDate(extractedJSON.startDate),
                      endDate: formatDate(extractedJSON.endDate),
                      startTime: extractedJSON.startTime,
                      endTime: extractedJSON.endTime,
                      price: extractedJSON.ticketPrice,
                      ticket_link: extractedJSON.ticketLink,
                      is_age_restricted: false,
                      orig_link: 'dummy_origlink1',
                      orig_thumb: responseBody.imageData,
                      poster: {user: "@"+username},
                      is_event: extractedJSON.is_event,
                      age_barrier: extractedJSON.age_barrier,
                      late: extractedJSON.late,
                      link_in_bio: extractedJSON.link_in_bio,
                      rsvp_required: extractedJSON.rsvp_required,
                      num_events: extractedJSON.num_events
                    } as Event];*/
                  } else {
                    /*extractedJSON.subEvents.forEach((subEvent: any, index: number) => {
                      newEvents = [...newEvents, {
                        id: 2,
                        venue: {
                          id: 5,
                          name: subEvent.venue,
                          address: subEvent.overallAddress,
                          city: subEvent.city,
                          state: subEvent.state,
                          country: subEvent.country,
                        },
                        name: subEvent.eventName,
                        artist: subEvent.artist.join(", "),
                        opener: subEvent.openers.join(", "),
                        host: subEvent.hosts.join(", "),
                        promoter: subEvent.promoters.join(", "),
                        offering: subEvent.offerings.join(", "),
                        timestamp: '2022-11-07T10:41:47.157839Z',
                        date: formatDate(subEvent.startDate),
                        time: subEvent.startTime,
                        startDate: formatDate(subEvent.startDate),
                        endDate: formatDate(subEvent.endDate),
                        startTime: subEvent.startTime,
                        endTime: subEvent.endTime,
                        price: subEvent.ticketPrice,
                        ticket_link: subEvent.ticketLink,
                        is_age_restricted: false,
                        orig_link: 'dummy_origlink1',
                        orig_thumb: responseBody.imageData,
                        poster: {user: "@"+username},
                        is_event: subEvent.is_event,
                        age_barrier: subEvent.age_barrier,
                        late: subEvent.late,
                        link_in_bio: subEvent.link_in_bio,
                        rsvp_required: subEvent.rsvp_required,
                        num_events: subEvent.num_events
                      } as Event];
                    });*/
                  }

                  setEvents(newEvents);
                  setProcessed((prevProcessed) => prevProcessed + 1);
                })
                .catch((error) => {
                  //console.log('error datum: ', error);
                  setProcessed((prevProcessed) => prevProcessed + 1);
                });
            }
          }, index * 30000);
        });
      });

      try {
        // await Promise.all(promises.flat())

        Promise.all(promises)
          .then((results) => {
            setEvents(newEvents);
            setLoaded((prevLoaded) => prevLoaded + 1);
          })
          .catch((error) => {
            //console.log('Error:', error);
          });

        /*for await (const promise of promises) {
          //console.log('Next promise completed...');
          ////console.log('Promise result:', promise);
        }*/

        // Rest of your code that depends on the completion of promises
        //console.log('Resolved, finally! ', newEvents);
        setEvents(newEvents);
        //setLoaded(prevLoaded => prevLoaded + 1);
      } catch (error) {
        console.error('Error fetching data:', error);
        // Handle error case
      }

      //setEvents(newEvents);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  useEffect(() => {
    //console.log('Num events processed: ', processed);
  }, [processed]);

  useEffect(() => {
    //console.log('Num events launched: ', launched);
  }, [launched]);

  //const [events, setEvents] = useState(null as Event[]);

  useEffect(() => {
    /*fetch(`/api/hello`)
    .then((response) => {
      //console.log("api response....: ",response.json())
    })
    .catch((error) => {
      //console.log("api response error: ",error)
    });*/

    //console.log('Results fetchment... ', experimental.accounts);
    /*for(const username in experimental.accounts){
      setTimeout(() => {
        //console.log("UN: ",experimental.accounts[username].replace('@', ''))
        fetchEvents(client,experimental.accounts[username].replace('@', ''))
      },20000);
    }*/

    const accounts = experimental.accounts; // Your list of accounts

    if (accounts.length > 0) {
      const username = accounts[0].replace('@', '');
      //console.log('UN: ', username);
      fetchEvents(client, username);
    }

    let index = 1;
    const intervalId = setInterval(() => {
      if (index < accounts.length) {
        const username = accounts[index].replace('@', '');
        //console.log('UN: ', username);
        fetchEvents(client, username);
        index++;
      } else {
        clearInterval(intervalId); // Stop the interval when all requests are sent
      }
    }, 50000); // 60 seconds delay
  }, [experimental.accounts]);

  return (
    <div className="flex flex-col h-screen bg-[#282726]">
      <div className="px-4 py-4 h-1/8 flex flex-row justify-between text-[#D0A215] font-semibold">
        <Link className="flex" href="/experimental">
          <img
            className="mt-[0.25em] h-[1em] hover:cursor-pointer"
            src="/images/backAlt.png"
          />
          <p className="ml-4 font-semibold"> Event Tracker (Beta) </p>
        </Link>
        <div>
          {
            /* loaded < experimental.accounts.length*/
            launched == 0 || (launched != 0 && launched != processed) ? (
              <div className="flex flex-row gap-1">
                <Spinner colorClass={'text-beaming-orange'} size={32} />

                <p>
                  {' '}
                  {loaded} / {experimental.accounts.length} accounts processed{' '}
                  {launched > 0 ? '; ' + processed : ''}{' '}
                  {launched > 0 ? '/ ' + launched + ' events processed' : ''}{' '}
                </p>
              </div>
            ) : (
              <p className="font-medium"> all accounts processed </p>
            )
          }
        </div>
      </div>
      <div className="flex flex-col flex-grow overflow-y-auto">
        <div className="flex items-center justify-center">
          <div className="mt-12 px-12 pb-12">
            <div className="flex flex-col items-center justify-center gap-16">
              {experimental.accounts.map((account: string, index: number) => (
                <EventsSection
                  key={index}
                  title={`Fetched Events against ${account}`}
                  subTitle={`Showing ${
                    events
                      ? events.filter(
                          (event) => event.poster.user === `${account}`
                        ).length
                      : 0
                  } event(s)`}
                  events={events.filter(
                    (event) => event.poster.user === `${account}`
                  )}
                  isAlt={true}
                  defaultIsExpanded={true}
                  onClick={() => {}}
                />
              ))}

              {/*<EventsSection
                key="fetchedEvents"
                title="Fetched Events"
                subTitle={`Showing ${events.length ?? 0} event(s)`}
                events={events}
                isAlt={true}
                defaultIsExpanded={true}
                onClick={() => {}}
              />
              <EventsSection
                key="fetchedEvents"
                title="Fetched Events"
                subTitle={`Showing ${events.length ?? 0} event(s)`}
                events={events}
                isAlt={true}
                defaultIsExpanded={true}
                onClick={() => {}}
              />*/}
              <EventDetails isEdit={false} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExperimentalResultsPage;
