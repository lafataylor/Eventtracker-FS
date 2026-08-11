import React from 'react';
import '../styles/globals.css';
import '@fontsource/montserrat';
import '@fontsource/montserrat/500.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/montserrat/800.css';
import { AppProps } from 'next/app';
import Layout from '../layout/Layout';
import { GoogleAnalytics } from 'nextjs-google-analytics';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <Layout>
      <GoogleAnalytics trackPageViews />
      <Component {...pageProps} />
    </Layout>
  );
}

export default MyApp;
