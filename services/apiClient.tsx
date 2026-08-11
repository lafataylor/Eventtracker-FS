import axios from 'axios';

const axiosClient = axios.create({
  baseURL: `https://eventtrackerapi.lafaslist.com/v1/`,
  // baseURL: `http://127.0.0.1:8000/v1/`,
  timeout: 30000,
});

axiosClient.interceptors.response.use(
  function (response) {
    return response;
  },
  function (error) {
    //console.log(error);
    let res = error.response;
    if (res?.status == 401) {
      window.location.href = '/mexico-city';
    }
    // console.error(“Looks like there was a problem. Status Code: “ + res.status);
    return Promise.reject('Axios error: ' + error);
  }
);

export default axiosClient;
