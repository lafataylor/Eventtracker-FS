import React, { useEffect, useState } from 'react';

interface ImageProps {
  baseImageUrl: any;
}

const Image = ({baseImageUrl}: ImageProps) => {
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    // Fetch the image URL from the API route when the ID changes
    //fetch(`/api/getImage/${encodeURIComponent(baseImageUrl.baseImageUrl)}`) 
    fetch(`/api/hello`)
    .then((response) => {
      //console.log("api response....: ",response.json())
    })
    .catch((error) => {
      //console.log("api response error: ",error)
    }); 

    fetch(`/api/getImage/${encodeURIComponent(baseImageUrl)}`) 
        .then((response) => {
          //console.log("success response: ",response)
          return response.json()
        })
        .then((responseBody) => {
          //console.log("success data: ",responseBody)
          /*const objectURL = URL.createObjectURL(responseBody.imageData.blob());
          //console.log("success image url: ", objectURL);*/
          setImageUrl(responseBody.imageData)
        })
        /*.then((response) => {
          //console.log("success response: ",response)
          if (!response.body) {
            throw new Error('ReadableStream is not yet supported in your browser.');
          }
          return response.blob();
        })*/
        /*.then((blob) => {
          //console.log("success data: ",blob)
          const objectURL = URL.createObjectURL(blob);
          //console.log("success image url: ", objectURL);
          setImageUrl(objectURL);
        })*/
        .catch((error) => {
          console.error('Error fetching image:', error);
        });
  }, []);

  return (
    <img className="w-full pb-1 rounded-xl flex-1" src={imageUrl} alt="Instagram Image" />
  );
};

export default Image;