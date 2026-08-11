import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useStore } from '../../store/store';
import Head from 'next/head';
import Image from 'next/image';
import { FaChevronDown, FaArrowLeft } from 'react-icons/fa';
import UserDropdown from '../../components/Dashboard/UserDropdown';

interface FAQItemProps {
  question: string;
  answer: React.ReactNode;
}

const FAQItem: React.FC<FAQItemProps> = ({ question, answer }) => {
    const [isExpanded, setIsExpanded] = useState(true);

    return (
    <div className="border border-[#ffffff04] rounded-lg mb-[40px] overflow-hidden">
      <div
        className="flex justify-between gap-4 items-center p-4 cursor-pointer bg-midnight-dark"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 className="text-mist-white font-medium text-lg">{question}</h3>
        <FaChevronDown
          className="text-beaming-orange-light transition-transform duration-200"
          style={{
            transform: isExpanded ? 'rotate(180deg)' : '',
          }}
        />
      </div>
      {isExpanded && (
        <div className="p-4 bg-[#ffffff04] text-mist-white">
          {answer}
        </div>
      )}
    </div>
  );
};

interface FAQSectionProps {
  title: string;
  items: FAQItemProps[];
}

const FAQSection: React.FC<FAQSectionProps> = ({ title, items }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="mb-8">
      <div
        className="rounded-xl hidden bg-beaming-orange flex items-start gap-4 p-4 cursor-pointer mb-4"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <FaChevronDown
          className="w-4 h-4 pt-[2px] mt-1 text-black transition-transform duration-200"
          style={{
            transform: isExpanded ? 'rotate(180deg)' : '',
          }}
        />
        <h2 className="font-semibold text-black select-none text-xl">{title}</h2>
      </div>
      {isExpanded && (
        <div className="pl-0">
          {items.map((item, index) => (
            <FAQItem key={index} question={item.question} answer={item.answer} />
          ))}
        </div>
      )}
    </div>
  );
};

const formatCityNameFromSlug = (slug: string) => {
  if (!slug) return '';
  return slug
    .replace(/-/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const FAQ = () => {
  const router = useRouter();
  const [state, dispatch] = useStore();
  const [isNavbarVisible, setIsNavbarVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isAtTop, setIsAtTop] = useState(true);
  const [language, setLanguage] = useState('en');
  const [activeDropdown, setActiveDropdown] = useState<string>('');
  const [mounted, setMounted] = useState(false);
  const [citySlug, setCitySlug] = useState('mexico-city');

  useEffect(() => {
    setMounted(true);
    // Check URL for language parameter
    const { locale } = router;
    if (locale === 'es') {
      setLanguage('es');
    }

    // Restore last visited city, if available
    try {
      const storedCity = localStorage.getItem('lastCity');
      if (storedCity) {
        setCitySlug(storedCity);
      }
    } catch (e) {
      // ignore if localStorage is unavailable
    }

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setIsAtTop(currentScrollY <= 100);
      if (currentScrollY <= 100) {
        setIsNavbarVisible(true);
      } else if (currentScrollY < lastScrollY) {
        setIsNavbarVisible(true);
      } else {
        setIsNavbarVisible(false);
      }
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [lastScrollY, router]);
  const formattedCityName = formatCityNameFromSlug(citySlug);
  const generalFAQs: FAQItemProps[] = language === 'en' ? [
    {
      question: "How do I save lafaslist to my home screen?",
      answer: (
        <p>
          To save lafaslist to your home screen on iPhone: <br /> <br />

          Navigate to lafaslist.com on Safari and then click the share icon on bottom of screen, then scroll down to "add to home screen" (if you're already in safari, press the back button to get out of this notion doc before hitting the share icon)
        </p>
      ),
    },
    {
      question: "How do you decide what makes it on the list?",
      answer: (
        <p>
          I have a diverse taste in music, so I include everything from House, Jazz, and World to Dancehall, Perreo, Classic Hip Hop, RnB, and Techno. <br /> <br />
          I also prioritize wellness experiences like Yoga, Hot Cold Therapy, Breathwork, and Meditation. <br /> <br />
          And since I'm passionate about food—whether it's street eats or Michelin-starred fine dining—I make sure to highlight pop-ups and other food-centric events. <br /> <br />
          Ultimately, I curate the list based on what excites me, feels special, and creates memorable experiences.
        </p>
      ),
    },
    {
      question: "Why do yesterday's events show under 'today'?",
      answer: (
        <p>
          We include events from yesterday so that if you're out at 1 AM you can still see events from yesterday that may still be happening. <br /> <br />
          You'll notice that the events from yesterday are slightly faded in color to show that they are older.
        </p>
      ),
    },
    {
      question: "Why should I use lafaslist and not some other option?",
      answer: (
        <p>
          Welllll I'm biased, but I think it's mainly 3 things: <br />
          <ul className="">
            <li className="pl-2 pt-2">● Places like Resident Advisor only have electronic music events. I have a bunch of dope  genres, art openings, wellness events, restaurant pop-ups, etc.</li>
            <li className="pl-2 pt-2">● My layout is cleaner, not cluttered with a bunch of unnecessary sections</li>
            <li className="pl-2 pt-2">● I include the underground, so it's not just a bunch of huge mainstream events</li>
          </ul>
        </p>
      ),
    },
    {
      question: "How come not every event shows genres?",
      answer: (
        <p>
          The details we list are mostly based on what was included on the flyer image. <br /> <br />
          If it's not on the flyer, it's likely not listed on our site.
        </p>
      ),
    },
    {
      question: "I see incorrect information, what should I do?",
      answer: (
        <p>
          We are still training our app to scan flyer data and thus sometimes it misses or incorrectly labels details. If you see that something is incorrect, please help the community be suggesting a correction via the "suggest edit" button.
          <br /><br />
          Also, please always doublecheck the listing/do your own research to make sure that times and locations are correct!
        </p>
      ),
    },
    {
      question: "What does lafaslist look like on desktop?",
      answer: (
        <p>
          Beautiful!👇
          <br /><br />
          <img src="/images/desktop.jpg" alt="Lafa's List Desktop" />
        </p>
      ),
    },
    
  ] : [
    {
      question: "¿Por qué los eventos de ayer aparecen bajo 'hoy'?",
      answer: (
        <p>
          Incluimos los eventos de ayer porque si estás fuera a la 1 AM, aún puedes ver los eventos de ayer que podrían seguir ocurriendo. Notarás que los eventos de ayer están ligeramente desvanecidos en color para mostrar que son más antiguos.
        </p>
      ),
    },
    {
      question: "¿Por qué debería usar lafaslist y no otra opción?",
      answer: (
        <p>
          Bueno, soy parcial, pero creo que principalmente son 3 cosas:
          - Sitios como Resident Advisor solo tienen eventos de música electrónica. Yo tengo una gran variedad de géneros, inauguraciones de arte, eventos de bienestar, pop-ups de restaurantes, etc.
          - Mi diseño es más limpio, sin secciones innecesarias que lo saturen
          - Incluyo eventos underground, no solo grandes eventos comerciales
        </p>
      ),
    },
    {
      question: "¿Está Lafa's List disponible en otros idiomas?",
      answer: (
        <p>
          ¡Sí! Lafa's List está actualmente disponible en inglés y español. Puedes cambiar de idioma utilizando
          el selector de idioma en el menú desplegable de usuario.
        </p>
      ),
    },
  ];

  return (
    <div className="py-5 font-montserrat min-h-screen bg-midnight">
      <Head>
        <title>{language === 'es' ? 'Preguntas Frecuentes - Lafa\'s List' : 'FAQ - Lafa\'s List'}</title>
        <meta name="description" content={language === 'es' ? 'Preguntas frecuentes sobre Lafa\'s List' : 'Frequently asked questions about Lafa\'s List'} />
      </Head>

      <nav
        className={`fixed top-0 left-0 w-[100vw] flex flex-row items-center justify-between px-4 py-4 lg:px-10 border-0 z-10 bg-midnight transition-transform duration-300 ${
          isNavbarVisible ? 'translate-y-0' : '-translate-y-full'
        } ${isAtTop ? 'border-0' : 'border-b-[2px] border-slate-black'}`}
      >
        <div className="flex items-center gap-3">
          <img
            src="/images/leftChevron.svg"
            className="mr-1 w-8 h-8 text-beaming-orange-light brightness-[1.3] hover:text-beaming-orange hover:cursor-pointer"
            onClick={() => router.push(`/${citySlug}`)}
          />
          <div className="flex items-end gap-3">
            <div className="w-[125px] overflow-hidden">
              <Image
                src="/images/wordMark.png"
                alt="Lafa's List"
                width={240}
                height={80}
                onClick={() => router.push(`/${citySlug}`)}
                className="cursor-pointer max-w-none"
              />
            </div>
            <span className="text-beaming-orange text-lg font-medium lowercase">
              {formattedCityName}
            </span>
          </div>
        </div>
        
        <div className="flex flex-1 justify-center mx-2 lg:mx-4">
          {/* Empty center space */}
        </div>
        
        <div className="flex items-center gap-2">
          {mounted && (
            <UserDropdown
              setActiveDropdown={setActiveDropdown}
              resetDropdowns={activeDropdown != 'user'}
              hideDropdown={!isNavbarVisible}
              language={language}
              isAboutSelected={true}
            />
          )}
        </div>
      </nav>

      <div
        className={`h-0 lg:h-[${
          isAtTop ? '3' : '0'
        }px] mt-[58px] lg:mt-[68px] mx-10 bg-gradient-to-r from-beaming-orange-light to-sacral-red`}
      />

      <h1 className="text-4xl font-bold text-beaming-orange mt-8 px-8 md:px-0 max-w-[1000px] mx-auto md:mt-24 mt-12">
        {language === 'es' ? 'Acerca de' : 'About'}
      </h1>

      <div className="flex flex-col md:flex-row gap-8 items-center px-8 md:px-0 py-10 max-w-[1000px] mx-auto  ">
        <div className="md:w-[420px] h-full">
          <Image
            src="/images/lafa.jpeg"
            alt="Lafayette Taylor"
            width={600}
            height={600}
            className="cursor-pointer rounded-md"
          />
        </div>

        <div className="flex flex-col justify-between gap-8 text-mist-white font-montserrat font-medium md:text-lg md:w-1/2 h-full min-h-full flex-grow ">
          <p>What up! My name is Lafa, I created this list because I got tired of collecting and sending boring lists of instagram links when my friends would ask me for event recommendations. Rather than gatekeep that list, I've decided to share it with you so you can easily see a bunch of interesting things going on in Mexico City at a glance. ⚡️</p>
          
          <p>I hope this list provides some value for you, and helps build community. 🫀</p>
          
          <p>If you feel inclined <a href="https://buymeacoffee.com/lafa" target="_blank" rel="noopener noreferrer" className="text-beaming-orange-light hover:text-beaming-orange transition-colors">buy me a mezcal</a>! 🌵</p>
          
          <p>Peace ✌🏽</p>
        </div>
      </div>

      <div className="container max-w-[1000px] mx-auto px-8 md:px-0 md:pt-28 pb-12">
        <h1 className="text-4xl font-bold text-beaming-orange my-8 ">
          {language === 'es' ? 'Preguntas Frecuentes' : 'Frequently Asked Questions'}
        </h1>

        <FAQSection
          title={language === 'es' ? 'Información General' : 'General Information'}
          items={generalFAQs}
        />

        <div className="mt-12 pt-6 text-center">
          <p
            className="text-mist-white cursor-pointer hover:text-beaming-orange transition-colors"
            onClick={() => router.push(`/${citySlug}`)}
          >
            {language === 'es'
              ? 'Haz clic aquí para volver al inicio'
              : 'Click here to go back home'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default FAQ;
