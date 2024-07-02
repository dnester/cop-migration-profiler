import axios from 'axios';
import fs from 'fs/promises';
import readline from 'readline';
import { createObjectCsvWriter } from 'csv-writer';

const configPath = '../config.json';
const outputDirectory = '../output'; 
const projectListPath = `${outputDirectory}/projectList.json`;
const csvPath = `${outputDirectory}/projectList.csv`;

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

const fetchProjectsWithAuth = async () => {
  try {
    await ensureOutputDirectoryExists();

    // Check if projectList.json already exists
    let fileExists = false;
    try {
      await fs.access(projectListPath);
      fileExists = true;
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }

    if (fileExists) {
      const answer = await askQuestion('projectList.json already exists. Do you want to delete it? [ yes | no ]: ');
      if (!['yes', 'y'].includes(answer.toLowerCase())) {
        console.log('Exiting script without making changes.');
        rl.close();
        return;
      }
      await fs.unlink(projectListPath);
      console.log('Existing projectList.json file deleted.');
    }

    // Check if projectList.csv already exists
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
      const answer = await askQuestion('projectList.csv already exists. Do you want to delete it? [ yes | no ]: ');
      if (!['yes', 'y'].includes(answer.toLowerCase())) {
        console.log('Exiting script without making changes.');
        rl.close();
        return;
      }
      await fs.unlink(csvPath);
      console.log('Existing projectList.csv file deleted.');
    }

    // Read config from config.json
    const configData = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);

    // Replace {customer} placeholder in URLs
    const authUrl = config.authUrlTemplate.replace('{customer}', config.customer);
    const authUrlV2 = config.authUrlV2Template.replace('{customer}', config.customer);
    const setPropertyUrl = config.setPropertyUrlTemplate.replace('{customer}', config.customer);
    const projectsUrl = config.projectsUrlTemplate.replace('{customer}', config.customer);
    const baseProjectsUrl = projectsUrl.split('?')[0];

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

    // Remove if you need to check JWT
    // console.log('Retrieved access token:', token);

    // Initialize variables for pagination
    let offset = 0;
    const limit = 5;
    let allProjects = [];
    let moreProjects = true;

    // Loop to fetch all projects with pagination
    while (moreProjects) {
      const projectsUrlWithPagination = `${baseProjectsUrl}?page[limit]=${limit}&page[offset]=${offset}`;

      // Config for fetching projects
      const projectsConfig = {
        method: 'get',
        maxBodyLength: Infinity,
        url: projectsUrlWithPagination,
        headers: { 
          'accept': 'application/vnd.api+json',
          'Authorization': `Bearer ${token}`
        }
      };

      console.log(`Fetching projects with offset=${offset}...`);
      // Request to fetch projects
      const projectsResponse = await axios.request(projectsConfig);
      console.log('Projects response received:', projectsResponse.status, projectsResponse.statusText);

      if (projectsResponse.status === 200) {
        const projectsData = projectsResponse.data.data;
        const formattedProjects = projectsData.map(project => ({
          id: project.id,
          type: project.attributes.type,
          properties: Object.keys(project.attributes.properties).length ? project.attributes.properties : { key: 'value' },
          name: project.attributes.name,
          branches: project.relationships.branches.links.related
        }));

        allProjects = [...allProjects, ...formattedProjects];

        // Check if there are more projects to fetch
        moreProjects = projectsData.length === limit;
        offset += limit;
      } else {
        console.error(`HTTP Error: ${projectsResponse.status} - ${projectsResponse.statusText}`);
        moreProjects = false;
      }
    }

    const jsonContent = JSON.stringify(allProjects, null, 2);

    // Write JSON content to file
    await fs.writeFile(projectListPath, jsonContent, 'utf8');
    console.log('Project list has been saved to projectList.json');

    // Write CSV content to file
    const csvWriter = createObjectCsvWriter({
      path: csvPath,
      header: [
        { id: 'id', title: 'ID' },
        { id: 'type', title: 'Type' },
        { id: 'properties', title: 'Properties' },
        { id: 'name', title: 'Name' },
        { id: 'branches', title: 'Branches' }
      ]
    });

    // Convert properties object to a string for CSV output
    const csvData = allProjects.map(project => ({
      ...project,
      properties: JSON.stringify(project.properties)
    }));

    await csvWriter.writeRecords(csvData);
    console.log('Project list has been saved to projectList.csv');

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

fetchProjectsWithAuth();
