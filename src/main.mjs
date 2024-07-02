/* ==========================================================================================================
 * 
 *      Description:
 * 
 *          A utility to evaluate the current environment of Coverity on Polaris.  The project is a collection
 *          of scripts that will create an output which provides:
 * 
 *            - Application List
 *            - Projects / Repositories
 *            - Users
 *            - Groups
 *  
 *          The script is offered in two types:  via main (all scripts execute) and the individual scripts 
 *          (located in the scripts folder). 
 * 
 *             a) Main Script:  This will execute all scripts which provides a CSV output which will provide 
 *                all information described above.
 * 
 *             b) Scripts folder   
 * 
 *                  - getApplicationList
 *                  - getProjectBranches
 *                  - getProjectProperties:  
 *                  - getProjectUserInformation
 * 
 *                  - setProjectProperties: Optional, this script will set key/value pairs for each project.
 *                    Once the scripts have been executed, the output will create a json file which you may 
 *                    then set key/value pairs.  The setProjectProperties will post the key/value pairs to the
 *                    projects.
 * 
 * 
 *      Usage:
 *          
 *          Review the CONFIG.JSON file and populate with the appropriate account information.  At a minimum, you
 *          must set:
 * 
 *            1.  Customer Tenant (customer)
 *            2.  Email Address
 *            3.  API Token
 *            4.  Password
 * 
 *
 * 
 *      Output:
 * 
 *          There are multiple output files which are created in both JSON and CSV formats.  If running the main.js
 *          script, finalProjectDetails.csv will be created in the output folder.
 * 
 * 
 *      Date: 
 *          
 *          May 21, 2024 -- Initial build
 *          
 *          May 28, 2024
 *                  -- Addition of pulling group information for all users.   There are three files created
 *                     (grouplist.json, userlist.json, userlist.csv)
 * 
 *          July 1, 2024
 *                  --  Addition of a main script (entry point) for all-in-one script to complete a full 
 *                      assessment.
 *                  --  Addition of a reporting script to combine all results from all scripts to a single, 
 *                      combined report (CSV Output).
 * 
 * 
 * 
 * ==========================================================================================================
 */


import axios from 'axios';
import fs from 'fs/promises';
import readline from 'readline';
import { createObjectCsvWriter } from 'csv-writer';
import { parseAsync } from 'json2csv';

const configPath = './config.json';
const outputDirectory = './output';
const projectListPath = `${outputDirectory}/projectList.json`;
const detailsListPath = `${outputDirectory}/userDetailsList.json`;
const branchesListPath = `${outputDirectory}/branchesList.json`;
const outputCsvPath = `${outputDirectory}/projectBranches.csv`;
const applicationsListPath = `${outputDirectory}/applicationsList.json`;
const applicationsCsvPath = `${outputDirectory}/applicationsList.csv`;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query) => {
  return new Promise((resolve) => rl.question(query, resolve));
};


/* Check to see if output directory exists.  If not, Create it for the user */

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

    
  /* Check if applicationsList.json already exists */
    

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
        return [];
      }
      await fs.unlink(applicationsListPath);
      console.log('Existing applicationsList.json file deleted.');
    }


    // 
    // Check if applicationsList.csv already exists
    // 


    fileExists = false;
    try {
      await fs.access(applicationsCsvPath);
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
        return [];
      }
      await fs.unlink(applicationsCsvPath);
      console.log('Existing applicationsList.csv file deleted.');
    }

    // Read config from config.json
    const configData = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);

    if (!config.authUrlTemplate || !config.authUrlV2Template || !config.applicationsUrlTemplate || !config.customer) {
      throw new Error('Missing required configuration properties.');
    }

    //
    // Replace customer placeholder in URLs.  Be sure to check the config.json file if this needs
    // to be updated

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

    // Initialize variables for pagination.  if you want to update pagination, please
    // check the COP documenation before proceeding.  This should work for almost 
    // all needs.


    let offset = 0;
    const limit = 25;
    let allApplications = [];
    let moreApplications = true;

    //
    //  Loop to fetch all applications with pagination.  Polaris likes pagination.
    //

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

   /* Prepare data for CSV with a unique line for each project */

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
      path: applicationsCsvPath,
      header: [
        { id: 'id', title: 'Application ID' },
        { id: 'name', title: 'Application Name' },
        { id: 'description', title: 'Description' },
        { id: 'project', title: 'Project ID' }
      ]
    });

    await csvWriter.writeRecords(csvData);
    console.log('Applications list has been saved to applicationsList.csv');

    return allApplications;
  } catch (error) {
    if (error.response) {
      // Handle errors from the server
      console.error(`HTTP Error: ${error.response.status} - ${error.response.statusText}`);
      console.error('Response data:', error.response.data);
    } else {
      // Handle other errors
      console.error('Error:', error.message);
    }
    return [];
  } finally {
    rl.close();
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
            name: project.attributes.name,
            properties: Object.keys(project.attributes.properties).length ? project.attributes.properties : { key: 'value' },
            branches: project.relationships.branches.links.related
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

    return allProjects;
  } catch (error) {
    if (error.response) {
      console.error(`HTTP Error: ${error.response.status} - ${error.response.statusText}`);
      console.error('Response data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    return [];
  }
};

const fetchRoleAssignments = async (allProjects) => {
  try {
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
    console.log('Details list has been saved to userDetailsList.json');

    const csvWriter = createObjectCsvWriter({
      path: `${outputDirectory}/userDetailsList.csv`,
      header: [
        { id: 'projectName', title: 'Project Name' },
        { id: 'projectId', title: 'Project ID' },
        { id: 'userType', title: 'Type' },
        { id: 'name', title: 'Name' },
        { id: 'email', title: 'Email' }
      ]
    });

    await csvWriter.writeRecords(allDetails);
    console.log('Details list has been saved to userDetailsList.csv');

    return allDetails;
  } catch (error) {
    if (error.response) {
      console.error(`HTTP Error: ${error.response.status} - ${error.response.statusText}`);
      console.error('Response data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    return [];
  }
};

const fetchBranchesWithAuth = async () => {
  try {
    await ensureOutputDirectoryExists();

    // Check if branchesList.json already exists
    let fileExists = false;
    try {
      await fs.access(branchesListPath);
      fileExists = true;
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }

    if (fileExists) {
      const answer = await askQuestion('branchesList.json already exists. Do you want to delete it? [ yes | no ]: ');
      if (!['yes', 'y'].includes(answer.toLowerCase())) {
        console.log('Exiting script without making changes.');
        rl.close();
        return [];
      }
      await fs.unlink(branchesListPath);
      console.log('Existing branchesList.json file deleted.');
    }

    // Read config from config.json
    const configData = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);

    // Replace {customer} placeholder in URLs
    const authUrl = config.authUrlTemplate?.replace('{customer}', config.customer);
    const authUrlV2 = config.authUrlV2Template?.replace('{customer}', config.customer);
    const branchesUrlTemplate = config.branchesUrlTemplate?.replace('{customer}', config.customer);

    if (!authUrl || !authUrlV2 || !branchesUrlTemplate) {
      throw new Error('One or more URL templates are missing or not correctly defined in the config.');
    }

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
    let allBranches = [];
    let moreBranches = true;

    // Loop to fetch all branches with pagination
    while (moreBranches) {
      const branchesUrl = branchesUrlTemplate.replace('{offset}', offset);

      console.log(`Fetching branches with URL: ${branchesUrl}`);
      const branchesConfig = {
        method: 'get',
        maxBodyLength: Infinity,
        url: branchesUrl,
        headers: { 
          'accept': 'application/vnd.api+json',
          'Authorization': `Bearer ${token}`
        }
      };

      try {
        const branchesResponse = await axios.request(branchesConfig);
        if (branchesResponse.status === 200) {
          const branchesData = branchesResponse.data.data;

          allBranches = [...allBranches, ...branchesData];

          // Check if there are more branches to fetch
          moreBranches = branchesData.length === 500;
          offset += 500;
        } else {
          console.error(`HTTP Error: ${branchesResponse.status} - ${branchesResponse.statusText}`);
          console.error('Response data:', branchesResponse.data);
          moreBranches = false;
        }
      } catch (branchError) {
        console.error(`Error fetching branches:`, JSON.stringify(branchError.response ? branchError.response.data : branchError.message, null, 2));
        moreBranches = false;
      }
    }

    const jsonContent = JSON.stringify({ data: allBranches }, null, 2);

    // Write JSON content to file
    await fs.writeFile(branchesListPath, jsonContent, 'utf8');
    console.log('Branches list has been saved to branchesList.json');

    return allBranches;

  } catch (error) {
    if (error.response) {
      // Handle errors from the server
      console.error(`HTTP Error: ${error.response.status} - ${error.response.statusText}`);
      console.error('Response data:', error.response.data);
    } else {
      // Handle other errors
      console.error('Error:', error.message);
    }
    return [];
  } finally {
    rl.close();
  }
};

const associateProjectsToBranches = async (allProjects, allBranches) => {
  try {
    // Create a map of project IDs to project names and associated branches
    const projectMap = allProjects.reduce((map, project) => {
      map[project.id] = { name: project.name, branches: [] };
      return map;
    }, {});

    // Associate branches to their respective projects
    allBranches.forEach(branch => {
      const projectId = branch.relationships.project.data.id;
      if (projectMap[projectId]) {
        projectMap[projectId].branches.push(branch.attributes.name);
      }
    });

    // Prepare data for CSV
    const csvData = Object.values(projectMap).map(project => {
      return {
        projectName: project.name,
        ...project.branches.reduce((obj, branchName, index) => {
          obj[`branchName${index + 1}`] = branchName;
          return obj;
        }, {})
      };
    });

    // Convert the data to CSV format
    const csvOutput = await parseAsync(csvData, {
      fields: ['projectName', ...Array.from({ length: Math.max(...csvData.map(project => Object.keys(project).length - 1)) }, (_, i) => `branchName${i + 1}`)],
      header: true
    });

    // Write the CSV content to file
    await fs.writeFile(outputCsvPath, csvOutput, 'utf8');
    console.log('Project branches have been saved to projectBranches.csv');

  } catch (error) {
    console.error('Error:', error.message);
  }
};


/* 
 *    Main 
 */


const main = async () => {
  const allApplications = await fetchApplicationsWithAuth();
  if (allApplications.length === 0) return;

  const allProjects = await fetchProjectsWithAuth();
  if (allProjects.length === 0) return;

  const allDetails = await fetchRoleAssignments(allProjects);
  if (allDetails.length === 0) return;

  const allBranches = await fetchBranchesWithAuth();
  if (allBranches.length === 0) return;

  await associateProjectsToBranches(allProjects, allBranches);
};

main();
