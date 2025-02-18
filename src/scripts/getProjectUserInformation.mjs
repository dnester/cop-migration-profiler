import axios from 'axios';
import fs from 'fs/promises';
import readline from 'readline';
import { createObjectCsvWriter } from 'csv-writer';

const configPath = '../config.json';
const outputDirectory = '../output'; 
const projectListPath = `${outputDirectory}/projectList.json`;
const detailsListPath = `${outputDirectory}/userDetailsList.json`;
const csvPath = `${outputDirectory}/userDetailsList.csv`;

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

    let allProjects = [];

    // Check if projectList.json already exists
    try {
      await fs.access(projectListPath);
      const projectListData = await fs.readFile(projectListPath, 'utf8');
      allProjects = JSON.parse(projectListData);
      console.log('Reading projects from existing projectList.json');
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }

      console.log('projectList.json does not exist. Fetching projects from the API.');

      const configData = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configData);

      const authUrl = config.authUrlTemplate.replace('{customer}', config.customer);
      const authUrlV2 = config.authUrlV2Template.replace('{customer}', config.customer);
      const projectsUrl = config.projectsUrlTemplate.replace('{customer}', config.customer);
      const baseProjectsUrl = projectsUrl.split('?')[0];

      let authConfig;

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
      } else {
        throw new Error('Neither password nor access token is provided in the config.');
      }

      console.log('Sending authentication request...');
      const authResponse = await axios.request(authConfig);
      console.log('Authentication response received:', authResponse.status, authResponse.statusText);

      let token;

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

      let offset = 0;
      const limit = 500;
      let moreProjects = true;

      while (moreProjects) {
        const projectsUrlWithPagination = `${baseProjectsUrl}?page[limit]=${limit}&page[offset]=${offset}`;

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
        const projectsResponse = await axios.request(projectsConfig);
        console.log('Projects response received:', projectsResponse.status, projectsResponse.statusText);

        if (projectsResponse.status === 200) {
          const projectsData = projectsResponse.data.data;
          const formattedProjects = projectsData.map(project => ({
            id: project.id,
            name: project.attributes.name
          }));

          allProjects = [...allProjects, ...formattedProjects];

          moreProjects = projectsData.length === limit;
          offset += limit;
        } else {
          console.error(`HTTP Error: ${projectsResponse.status} - ${projectsResponse.statusText}`);
          moreProjects = false;
        }
      }

      const jsonContent = JSON.stringify(allProjects, null, 2);

      await fs.writeFile(projectListPath, jsonContent, 'utf8');
      console.log('Project list has been saved to projectList.json');
    }

    // Extract user and group details from each project
    let allDetails = [];

    const configData = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);
    const authUrl = config.authUrlTemplate.replace('{customer}', config.customer);
    const authUrlV2 = config.authUrlV2Template.replace('{customer}', config.customer);

    let authConfig;

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
    } else {
      throw new Error('Neither password nor access token is provided in the config.');
    }

    console.log('Sending authentication request...');
    const authResponse = await axios.request(authConfig);
    console.log('Authentication response received:', authResponse.status, authResponse.statusText);

    let token;

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

    for (const project of allProjects) {
      const roleAssignmentsUrl = `https://${config.customer}.polaris.synopsys.com/api/auth/v2/role-assignments?filter%5Brole-assignments%5D%5Bobject%5D%5B%24eq%5D=urn%3Ax-swip%3Aprojects%3A${project.id}&include%5Brole-assignments%5D%5B%5D=role&include%5Brole-assignments%5D%5B%5D=user&include%5Brole-assignments%5D%5B%5D=group`;

      const roleAssignmentsConfig = {
        method: 'get',
        maxBodyLength: Infinity,
        url: roleAssignmentsUrl,
        headers: { 
          'accept': 'application/vnd.api+json',
          'Authorization': `Bearer ${token}`
        }
      };

      console.log(`Fetching role assignments for project ${project.name} (ID: ${project.id})...`);
      const roleAssignmentsResponse = await axios.request(roleAssignmentsConfig);
      console.log('Role assignments response received:', roleAssignmentsResponse.status, roleAssignmentsResponse.statusText);

      if (roleAssignmentsResponse.status === 200) {
        const users = roleAssignmentsResponse.data.included.filter(item => item.type === 'users').map(user => ({
          projectName: project.name,
          projectId: project.id,
          userType: 'User',
          name: user.attributes.name,
          email: user.attributes.email
        }));

        const groups = roleAssignmentsResponse.data.included.filter(item => item.type === 'groups').map(group => ({
          projectName: project.name,
          projectId: project.id,
          userType: 'GroupName',
          name: group.attributes.groupname,
          email: ''
        }));

        allDetails = [...allDetails, ...users, ...groups];
      } else {
        console.error(`HTTP Error: ${roleAssignmentsResponse.status} - ${roleAssignmentsResponse.statusText}`);
      }
    }

    const detailsJsonContent = JSON.stringify(allDetails, null, 2);

    await fs.writeFile(detailsListPath, detailsJsonContent, 'utf8');
    console.log('Details list has been saved to detailsList.json');

    const csvWriter = createObjectCsvWriter({
      path: csvPath,
      header: [
        { id: 'projectName', title: 'Project Name' },
        { id: 'projectId', title: 'Project ID' },
        { id: 'userType', title: 'Type' },
        { id: 'name', title: 'Name' },
        { id: 'email', title: 'Email' }
      ]
    });

    await csvWriter.writeRecords(allDetails);
    console.log('Details list has been saved to detailsList.csv');

  } catch (error) {
    if (error.response) {
      console.error(`HTTP Error: ${error.response.status} - ${error.response.statusText}`);
      console.error('Response data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  } finally {
    rl.close();
  }
};

fetchProjectsWithAuth();
