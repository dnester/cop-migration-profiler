# Coverity on Polaris Environment Evaluation Utility

## Description

A utility to evaluate the current environment of Coverity on Polaris. The project is a collection of scripts that will create an output which provides:

- Application List
- Projects / Repositories
- Users
- Groups

The script is offered in two types: via main (all scripts execute) and the individual scripts (located in the scripts folder).

### Main Script
This will execute all scripts which provides a CSV output which will provide all information described above.

### Scripts Folder

- `getApplicationList`
- `getProjectBranches`
- `getProjectProperties`
- `getProjectUserInformation`
- `setProjectProperties`: Optional, this script will set key/value pairs for each project. Once the scripts have been executed, the output will create a JSON file which you may then set key/value pairs. The `setProjectProperties` will post the key/value pairs to the projects.

## Usage

Review the `CONFIG.JSON` file and populate with the appropriate account information. At a minimum, you must set:

1. Customer Tenant (`customer`)
2. Email Address
3. API Token
4. Password

## Output

There are multiple output files which are created in both JSON and CSV formats. If running the `main.js` script, `finalProjectDetails.csv` will be created in the output folder.

## Changelog

### May 21, 2024
- Initial build

### May 28, 2024
- Addition of pulling group information for all users. There are three files created (`grouplist.json`, `userlist.json`, `userlist.csv`)

### July 1, 2024
- Addition of a main script (entry point) for all-in-one script to complete a full assessment.
- Addition of a reporting script to combine all results from all scripts to a single, combined report (CSV Output).
