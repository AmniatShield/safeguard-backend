## First Stage

Clone the repo

## Second Stage

Install npm dependencies with `npm i`

## Third Stage

Change values inside index.js like OpenAI API key, VM name and Snapshot name

## Fourth Stage

You would need to download virt-manager and create a clean Windows 10 install
Also, you should make a virtural network bridge, with host being `192.168.122.1`

## Fifth Stage

Install the required monitoring tools on the vm, downloading required tools from `http://192.168.122.1:3000/download`

> Reminder: Disable Windows Defender and Firewall

## Sixth Stage

Unblock the powershell manager file (`vmt.ps1`) and set it up to run at system start (via Task Schedular)

> Reminder: Should be run as admin

## Seventh Stage

Make a clean snapshot of the vm (with all tools insalled and configured)

## Eighth Stage

If all goes well, you should be able to run the backend with `sudo node index.js` and opening `http://localhost:3000`
Uploading a file should start the analysis
