import fs from 'fs/promises';
import { parseAsync } from 'json2csv';

const projectListPath = './output/projectList.json';
const detailsListPath = './output/userDetailsList.json';
const branchesListPath = './output/branchesList.json';
const applicationsListPath = './output/applicationsList.json';
const outputCsvPath = './output/finalProjectDetails.csv';

const readLocalFiles = async (filePath) => {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
    return [];
  }
};

const combineDataAndGenerateCsv = async () => {
  try {
    const allProjects = await readLocalFiles(projectListPath);
    const allDetails = await readLocalFiles(detailsListPath);
    const allBranches = await readLocalFiles(branchesListPath);
    const allApplications = await readLocalFiles(applicationsListPath);

    const projectMap = allProjects.reduce((map, project) => {
      map[project.id] = { 
        projectName: project.name, 
        projectId: project.id, 
        type: project.type, 
        branches: [], 
        users: [], 
        groups: [] 
      };
      return map;
    }, {});

    allBranches.data.forEach(branch => {
      const projectId = branch.relationships.project.data.id;
      if (projectMap[projectId]) {
        projectMap[projectId].branches.push(branch.attributes.name);
      }
    });

    allDetails.forEach(detail => {
      const project = projectMap[detail.projectId];
      if (project) {
        if (detail.userType === 'User') {
          project.users.push({ name: detail.name, email: detail.email, type: 'Individual User' });
        } else if (detail.userType === 'GroupName') {
          project.groups.push({ name: detail.name, type: 'Group' });
        }
      }
    });

    const applicationMap = allApplications.reduce((map, application) => {
      application.projects.forEach(projectId => {
        if (projectMap[projectId]) {
          map[projectId] = application.name;
        }
      });
      return map;
    }, {});

    const csvData = [];
    Object.values(projectMap).forEach(project => {
      const maxBranches = 5;
      const branches = project.branches.slice(0, maxBranches);
      while (branches.length < maxBranches) branches.push('');

      const applicationName = applicationMap[project.projectId] || 'No Application Name';

      project.users.forEach(user => {
        csvData.push({
          applicationName,
          projectName: project.projectName,
          projectId: project.projectId,
          type: user.type,
          name: user.name,
          email: user.email,
          ...branches.reduce((obj, branch, index) => {
            obj[`branchName${index + 1}`] = branch;
            return obj;
          }, {})
        });
      });

      project.groups.forEach(group => {
        csvData.push({
          applicationName,
          projectName: project.projectName,
          projectId: project.projectId,
          type: group.type,
          name: group.name,
          email: '',
          ...branches.reduce((obj, branch, index) => {
            obj[`branchName${index + 1}`] = branch;
            return obj;
          }, {})
        });
      });
    });

    const csvOutput = await parseAsync(csvData, {
      fields: [
        'applicationName',
        'projectName', 
        'projectId', 
        'type', 
        'name', 
        'email', 
        'branchName1', 
        'branchName2', 
        'branchName3', 
        'branchName4', 
        'branchName5'
      ],
      header: true
    });

    await fs.writeFile(outputCsvPath, csvOutput, 'utf8');
    console.log('Final project details have been saved to finalProjectDetails.csv');

  } catch (error) {
    console.error('Error:', error.message);
  }
};

combineDataAndGenerateCsv();
