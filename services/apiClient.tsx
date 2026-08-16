import axios from 'axios';

const axiosClient = axios.create({
  // Defaults to production so deployed behaviour is unchanged when the env var
  // is unset. Set NEXT_PUBLIC_API_BASE_URL in FE/.env.local to point local dev
  // at a local API instead of writing to production.
  //
  // The trailing slash is normalised on purpose: requests here use relative
  // paths ('event/search/') so the base must end in '/', whereas utils/
  // locations.ts and utils/geocode.ts build '${BASE}/admin/...' and so must
  // not. Without this, setting the env var yields '/v1//event/...' which the
  // auth middleware rejects with 403.
  baseURL: `${(
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    'https://eventtrackerapi.lafaslist.com/v1'
  ).replace(/\/+$/, '')}/`,
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
