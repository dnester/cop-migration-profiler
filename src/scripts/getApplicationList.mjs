import axios from 'axios';
import fs from 'fs/promises';
import readline from 'readline';
import { createObjectCsvWriter } from 'csv-writer';

const configPath = '../config.json';
const outputDirectory = '../output'; 
const applicationsListPath = `${outputDirectory}/applicationsList.json`;
const csvPath = `${outputDirectory}/applicationsList.csv`;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query) => {
  return new Promise((resolve) => rl.question(query, resolve));
};

const ensureOutputDirectoryExists = async () => {
  try {
    await fs.access(outputDirectory);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.mkdir(outputDirectory);
      console.log('Created output directory.');
    } else {
      throw err;
    }
  }
};

const fetchApplicationsWithAuth = async () => {
  try {
    await ensureOutputDirectoryExists();

    // Check if applicationsList.json already exists
    let fileExists = false;
    try {
      await fs.access(applicationsListPath);
      fileExists = true;
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }

    if (fileExists) {
      const answer = await askQuestion('applicationsList.json already exists. Do you want to delete it? [ yes | no ]: ');
      if (!['yes', 'y'].includes(answer.toLowerCase())) {
        console.log('Exiting script without making changes.');
        rl.close();
        return;
      }
      await fs.unlink(applicationsListPath);
      console.log('Existing applicationsList.json file deleted.');
    }

    // Check if applicationsList.csv already exists
    fileExists = false;
    try {
      await fs.access(csvPath);
      fileExists = true;
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }

    if (fileExists) {
      const answer = await askQuestion('applicationsList.csv already exists. Do you want to delete it? [ yes | no ]: ');
      if (!['yes', 'y'].includes(answer.toLowerCase())) {
        console.log('Exiting script without making changes.');
        rl.close();
        return;
      }
      await fs.unlink(csvPath);
      console.log('Existing applicationsList.csv file deleted.');
    }

    // Read config from config.json
    const configData = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);

    if (!config.authUrlTemplate || !config.authUrlV2Template || !config.applicationsUrlTemplate || !config.customer) {
      throw new Error('Missing required configuration properties.');
    }

    // Replace {customer} placeholder in URLs
    const authUrl = config.authUrlTemplate.replace('{customer}', config.customer);
    const authUrlV2 = config.authUrlV2Template.replace('{customer}', config.customer);
    const applicationsUrlTemplate = config.applicationsUrlTemplate.replace('{customer}', config.customer);
    const baseApplicationsUrl = applicationsUrlTemplate.split('?')[0];

    let authConfig;

    // Check if password or API key (access token) is provided and configure the auth request
    if (config.password && config.password.trim() !== "") {
      const authData = new URLSearchParams();
      authData.append('email', config.email);
      authData.append('password', config.password);

      authConfig = {
        method: 'post',
        url: authUrl,
        headers: { 
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        data: authData
      };
    } else if (config.accesstoken && config.accesstoken.trim() !== "") {
      const authData = new URLSearchParams();
      authData.append('email', config.email);
      authData.append('accesstoken', config.accesstoken);

      authConfig = {
        method: 'post',
        url: authUrlV2,
        headers: { 
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        data: authData
      };

      console.log('Using access token for authentication:');
      console.log('Request URL:', authConfig.url);
      console.log('Request Headers:', authConfig.headers);
      console.log('Request Data:', authData.toString());
    } else {
      throw new Error('Neither password nor access token is provided in the config.');
    }

    console.log('Sending authentication request...');
    // Request to retrieve JWT token
    const authResponse = await axios.request(authConfig);
    console.log('Authentication response received:', authResponse.status, authResponse.statusText);

    let token;

    // Extract the token from the set-cookie header or response body
    const setCookieHeader = authResponse.headers['set-cookie'];
    if (setCookieHeader) {
      const tokenCookie = setCookieHeader.find(cookie => cookie.startsWith('access_token='));
      if (tokenCookie) {
        token = tokenCookie.split(';')[0].split('=')[1];
      }
    }

    if (!token && authResponse.data && authResponse.data.jwt) {
      token = authResponse.data.jwt;
    }

    if (!token) {
      throw new Error('No access token found in the response.');
    }

    // Initialize variables for pagination
    let offset = 0;
    const limit = 25;
    let allApplications = [];
    let moreApplications = true;

    // Loop to fetch all applications with pagination
    while (moreApplications) {
      const applicationsUrlWithPagination = `${baseApplicationsUrl}?page[limit]=${limit}&page[offset]=${offset}`;

      // Config for fetching applications
      const applicationsConfig = {
        method: 'get',
        maxBodyLength: Infinity,
        url: applicationsUrlWithPagination,
        headers: { 
          'accept': 'application/vnd.api+json',
          'Authorization': `Bearer ${token}`
        }
      };

      console.log(`Fetching applications with offset=${offset}...`);
      // Request to fetch applications
      const applicationsResponse = await axios.request(applicationsConfig);
      console.log('Applications response received:', applicationsResponse.status, applicationsResponse.statusText);

      if (applicationsResponse.status === 200) {
        const applicationsData = applicationsResponse.data.data;
        const formattedApplications = applicationsData.map(application => ({
          id: application.id,
          name: application.attributes.name,
          description: application.attributes.description,
          projects: application.relationships.projects.data.map(project => project.id)
        }));

        allApplications = [...allApplications, ...formattedApplications];

        // Check if there are more applications to fetch
        moreApplications = applicationsData.length === limit;
        offset += limit;
      } else {
        console.error(`HTTP Error: ${applicationsResponse.status} - ${applicationsResponse.statusText}`);
        moreApplications = false;
      }
    }

    const jsonContent = JSON.stringify(allApplications, null, 2);

    // Write JSON content to file
    await fs.writeFile(applicationsListPath, jsonContent, 'utf8');
    console.log('Applications list has been saved to applicationsList.json');

    // Prepare data for CSV with a unique line for each project
    let csvData = [];
    allApplications.forEach(application => {
      application.projects.forEach(project => {
        csvData.push({
          id: application.id,
          name: application.name,
          description: application.description,
          project
        });
      });
    });

    // Write CSV content to file
    const csvWriter = createObjectCsvWriter({
      path: csvPath,
      header: [
        { id: 'id', title: 'Application ID' },
        { id: 'name', title: 'Application Name' },
        { id: 'description', title: 'Description' },
        { id: 'project', title: 'Project ID' }
      ]
    });

    await csvWriter.writeRecords(csvData);
    console.log('Applications list has been saved to applicationsList.csv');

  } catch (error) {
    if (error.response) {
      // Handle errors from the server
      console.error(`HTTP Error: ${error.response.status} - ${error.response.statusText}`);
      console.error('Response data:', error.response.data);
    } else {
      // Handle other errors
      console.error('Error:', error.message);
    }
  } finally {
    rl.close();
  }
};

fetchApplicationsWithAuth();
