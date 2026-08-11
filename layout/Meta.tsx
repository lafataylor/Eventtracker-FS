import Head from 'next/head';

interface MetaProps {
  title: string;
  keywords: string;
  description: string;
  locationName?: string;
}

const Meta = ({ title, keywords, description, locationName }: MetaProps) => {
  // Determine which social share image to use
  const socialShareImage = locationName?.includes('san-fran') ? '/sf_social_share_preview.jpg' : '/sf_social_share_preview.jpg';
  
  // Determine the correct URL
  const pageUrl = locationName ? `https://lafaslist.com/${locationName}` : 'https://lafaslist.com';
  
  return (
    <Head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="keywords" content={keywords} />
      <meta name="description" content={description} />
      <meta charSet="utf-8" />
      <title>{title}</title>

      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      {/* Make sure the preview image exists in your public folder */}
      <meta property="og:image" content={socialShareImage} />
      <meta property="og:url" content={pageUrl} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Lafa's List" />

      {/* Twitter meta tags */}
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={socialShareImage} />
      <meta name="twitter:card" content="summary_large_image" />
      
      {/* Debug info for Meta component */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            console.log('Meta Component - Location Name: ${locationName}');
            console.log('Meta Component - Social Share Image: ${socialShareImage}');
            console.log('Meta Component - Page URL: ${pageUrl}');
          `,
        }}
      />
    </Head>
  );
};

Meta.defaultProps = {
  title: "lafaslist",
  keywords: 'event, tracker, web app, instagram',
  description: 'Instagram Event Extractor',
};

export default Meta;
