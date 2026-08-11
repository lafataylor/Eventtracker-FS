/** @type {import('tailwindcss').Config} */
module.exports = {
  mode: 'jit',
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    colors: {
      "midnight-transparent": "#28272690",
      "midnight": "#282726",
      "midnight-dark": "#1C1B1A",
      "sacral-red": "#F73800",       
      "beaming-orange": "#DA702C",     
      "beaming-orange-transparent": "#DA702C40",  
      "beaming-orange-dark": "#BC5215", 
      "beaming-orange-light": "#F88C16",
      "slate-black": "#403E3C",   
      "mist-white": "#FFFCF0",      
      "pearl-white": "#EBF8F8",     
      "seafoam-blue": "#5cb6cb33", 
      "onyx-black": "#100F0F",      
      "shadow-black": "#00000026",  
      "transparent-black": "#00000040",
      "dim-shadow": "#0000000d",
      "transparent-white": "#ffffff00",
      "stone-gray": "#6F6E69",
      "slate-gray": "#696868",
      "charcoal-gray": "#444444",
      "off-white": "#fcfcfc" ,
      "linen-beige": "#E6E4D9",
      "gunmetal-gray": "#454545",
      "ash-beige": "#DAD8CE",
      "ocean-blue": "#62b6cb",
      "teal-ocean": "#5096A8",
      "lime-zest": "#dce35d",
      "ocean-mist": "#62b6cb03",
      "black": "#000000", 
      "white": "#FFFFFF",
      "vibrant-red": "#f75c28",     
      "vibrant-green": "#a8eb34",    
      "bright-orange": "#FFA500",
      "solid-red": "#D94F4F",
      "muted-red": "#D14A32",
      "deep-red": "#b32e19",
      "light-beige": "#B7B5AC",
      "moonlight-blue": "#57B1FE",
      "golden-yellow": "#E3AF36",
    },
    extend: {
      screens: {
        'lg': '1200px',
        'ex': '1380px',
        'exx': '1500px'
      },
      fontFamily: {
        montserrat: 'Montserrat',
      },
      backgroundClip: ['text']
    },
  },
  plugins: [
    require('tailwind-scrollbar'),
    function ({ addUtilities, theme }) {
      const newUtilities = {
        ':root': {
          '--color-beaming-orange-transparent': theme('colors.beaming-orange-transparent'),
          '--color-light-beige': theme('colors.light-beige'),
          '--color-mist-white': theme('colors.mist-white'),
          '--color-midnight': theme('colors.midnight'),
        },
        
      };

      addUtilities(newUtilities, ['responsive', 'hover']);
    }
  ],
};
