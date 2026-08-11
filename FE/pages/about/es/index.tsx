import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useStore } from '../../../store/store';
import Head from 'next/head';
import Image from 'next/image';
import { FaChevronDown, FaArrowLeft } from 'react-icons/fa';
import UserDropdown from '../../../components/Dashboard/UserDropdown';

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
    setLanguage('es');

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

  const generalFAQs: FAQItemProps[] = [
    {
      question: "¿Cómo guardo lafaslist en mi pantalla de inicio?",
      answer: (
        <p>
          Para guardar lafaslist en tu pantalla de inicio en iPhone: <br /> <br />

          Navega a lafaslist.com en Safari y luego haz clic en el ícono de compartir en la parte inferior de la pantalla, después desplázate hacia abajo hasta "Añadir a la pantalla de inicio" (si ya estás en safari, presiona el botón de retroceso para salir de este documento antes de presionar el ícono de compartir)
        </p>
      ),
    },
    {
      question: "¿Cómo decides qué eventos incluir en la lista?", 
      answer: (
        <p>
          Tengo un gusto musical diverso, así que incluyo todo, desde House, Jazz y World hasta Dancehall, Perreo, Hip Hop Clásico, RnB y Techno. <br /> <br />
          También priorizo experiencias de bienestar como Yoga, Terapia de Frío-Calor, Respiración y Meditación. <br /> <br />
          Y como soy un apasionado de la comida—ya sea comida callejera o restaurantes con estrellas Michelin—me aseguro de destacar pop-ups y otros eventos gastronómicos. <br /> <br />
          En última instancia, curo la lista basándome en lo que me emociona, se siente especial y crea experiencias memorables.
        </p>
      ),
    },
    {
      question: "¿Por qué los eventos de ayer aparecen bajo 'hoy'?",
      answer: (
        <p>
          Incluimos los eventos de ayer porque si estás fuera a la 1 AM, aún puedes ver los eventos de ayer que podrían seguir ocurriendo. <br /> <br />
          Notarás que los eventos de ayer están ligeramente desvanecidos en color para mostrar que son más antiguos.
        </p>
      ),
    },
    {
      question: "¿Por qué debería usar lafaslist y no otra opción?",
      answer: (
        <p>
          Bueno, soy parcial, pero creo que principalmente son 3 cosas: <br />
          <ul className="">
            <li className="pl-2 pt-2">● Sitios como Resident Advisor solo tienen eventos de música electrónica. Yo tengo una gran variedad de géneros, inauguraciones de arte, eventos de bienestar, pop-ups de restaurantes, etc.</li>
            <li className="pl-2 pt-2">● Mi diseño es más limpio, sin secciones innecesarias que lo saturen</li>
            <li className="pl-2 pt-2">● Incluyo eventos underground, no solo grandes eventos comerciales</li>
          </ul>
        </p>
      ),
    },
    {
      question: "¿Por qué no todos los eventos muestran géneros?",
      answer: (
        <p>
          Los detalles que listamos están basados principalmente en lo que se incluyó en la imagen del flyer. <br /> <br />
          Si no está en el flyer, probablemente no esté listado en nuestro sitio.
        </p>
      ),
    },
    {
      question: "Veo información incorrecta, ¿qué debo hacer?",
      answer: (
        <p>
          Todavía estamos entrenando nuestra aplicación para escanear datos de flyers y a veces omite o etiqueta incorrectamente los detalles. Si ves que algo está incorrecto, ayuda a la comunidad sugiriendo una corrección a través del botón "sugerir edición".
          <br /><br />
          Además, ¡por favor siempre verifica la información y haz tu propia investigación para asegurarte de que los horarios y ubicaciones sean correctos!
        </p>
      ),
    },
    {
      question: "¿Cómo se ve lafaslist en escritorio?",
      answer: (
        <p>
          ¡Hermoso!👇
          <br /><br />
          <img src="/images/desktop.jpg" alt="Lafa's List Desktop" />
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
            onClick={() => router.push(`/es/${citySlug}`)}
          />
          <div className="flex items-end gap-3">
            <div className="w-[125px] overflow-hidden">
              <Image
                src="/images/wordMark.png"
                alt="Lafa's List"
                width={240}
                height={80}
                onClick={() => router.push(`/es/${citySlug}`)}
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
            <UserDropdown setActiveDropdown={setActiveDropdown} resetDropdowns={activeDropdown != 'user'} hideDropdown={!isNavbarVisible} language={language} isAboutSelected={true} />
          )}
        </div>
      </nav>
          

      <div className="container hidden px-6 py-6 text-beaming-orange-light">
        <button 
          onClick={() => router.push(`/es/${citySlug}`)}
          className="flex items-center hover:text-beaming-orange transition-colors"
        >
          <FaArrowLeft className="mr-2" />
          <span className="hover:underline">{language === 'es' ? 'Volver al inicio' : 'Back to Home'}</span>
        </button>
      </div>


      <h1 className="text-4xl font-bold text-beaming-orange mt-8 px-8 md:px-0 max-w-[1000px] mx-auto md:mt-24 mt-16">
        {language === 'es' ? 'Acerca de' : 'About'}
      </h1>

      <div className="flex flex-col md:flex-row gap-8 items-center px-8 md:px-0 py-10 max-w-[1000px] mx-auto ">
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

      <div className="container max-w-[1040px] mx-auto px-8 md:px-0 md:pt-28 pb-12">
        <h1 className="text-4xl font-bold text-beaming-orange my-8 md:px-5">
          {language === 'es' ? 'Preguntas Frecuentes' : 'Frequently Asked Questions'}
        </h1>

        <FAQSection
          title={language === 'es' ? 'Información General' : 'General Information'}
          items={generalFAQs}
        />

        <div className="mt-12 pt-6 text-center">
          <p
            className="text-mist-white cursor-pointer hover:text-beaming-orange transition-colors"
            onClick={() => router.push(`/es/${citySlug}`)}
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
