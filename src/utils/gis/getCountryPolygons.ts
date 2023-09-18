import axios from 'axios';
import config from 'config';
import { set } from 'lodash';
import { parse } from 'wellknown';

export const getToken = async () => {
  const details: any = {
    grant_type: 'client_credentials',
    client_id: config.get('commonServices.clientId'),
    client_secret: config.get('commonServices.clientSecret'),
    scope: config.get('commonServices.scope'),
  };
  const formBody = [];
  for (const property in details) {
    const encodedKey = encodeURIComponent(property);
    const encodedValue = encodeURIComponent(details[property]);
    formBody.push(encodedKey + '=' + encodedValue);
  }
  const body = formBody.join('&');
  return (
    await axios({
      url: 'https://login.microsoftonline.com/f610c0b7-bd24-4b39-810b-3dc280afb590/oauth2/v2.0/token',
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': `${body.length}`,
      },
      data: body,
    })
  ).data.access_token;
};

export const getCountryPolygons = (
  token: string,
  mapping: any,
  iso2codes: string[]
) => {
  return axios({
    url: 'https://portal-test.who.int/ems-core-api-dev/api/graphql',
    method: 'post',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: {
      query: `
        query {
          countrys(
            filter: {
              iso2code_in: ${iso2codes}
            }
          ) {
            iso2code
            polygons
          }
        }
      `,
    },
  })
    .then(({ data }) => {
      for (const country of data.data.countrys) {
        if (country.polygons && country.iso2code) {
          set(mapping, country.iso2code, parse(country.polygons));
        }
      }
    })
    .catch((error) => {
      console.log(error.message);
    });
};

export const getPolygons = async (codes: string[]) => {
  const mapping = {};
  const token = await getToken();
  console.timeLog('test');
  await getCountryPolygons(token, mapping, codes);
  console.timeLog('test');
  return mapping;
};
