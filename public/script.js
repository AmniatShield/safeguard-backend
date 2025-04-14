const fileInput = document.getElementById('input-btn');
const outputBoxes = document.getElementById('output-box');
const aiBoxes = document.getElementById('ai');

fileInput.addEventListener('change', () => {
    document.fileform.submit();
    let int = setInterval(() => {
      fetch('/update')
  .then(response => response.json())  // Parse the JSON response
  .then(data => {
    if (data.results != null) {
        //document.getElementById('fileData').innerHTML = `File Size: ${data.fileSize} MB <br /> File Hash: ${data.fileHash}`;
        displayFileDetails(data.results, data.fileName, data.fileSize, data.fileHash);
        clearInterval(int);
      outputBoxes.classList.remove('hide');
      aiBoxes.classList.remove('hide');
      document.getElementById("loading").classList.add("hide");
      document.getElementById("title").classList.remove("hide");
      document.getElementById("footer").classList.add("hide");
      document.getElementById("footer").style.width = '0%';
      document.getElementById("adsPlace").classList.add("hide");
      document.getElementById("ads").classList.add("hide");
      document.getElementById("input-box").classList.add("hide");
    } else {
        console.log('Waiting for AI');
    }
  })
  .catch(error => {
    console.error('Error fetching data:', error);
  });

    }, 1000);
    setTimeout(() => {
      //outputBoxes.classList.remove('hide');
      document.getElementById("content").classList.remove("h-[512px]");
      document.getElementById("content").classList.add("h-[930px]");
      //aiBoxes.classList.remove('hide');
      document.getElementById("loading").classList.remove("hide");
      document.getElementById("title").classList.add("hide");
      document.getElementById("input-box").classList.add("hide");
    }, 1000);
  });

window.addEventListener("load",e=>{
  document.getElementById("ai-chat").innerHTML = "<div class='text-sm text-white-950 mt-5 text-left bg-gray-800 p-2 mb-2 rounded-tl-xl rounded-tr-xl rounded-br-xl'>سلام! چطور میتوانم کمکتان کنم؟سلام! چطور میتوانم کمکتان کنم؟سلام! چطور میتوانم کمکتان کنم؟</div>"
})

document.getElementById("send").addEventListener("click",async e =>{
  let text = document.getElementById("text").value;
  document.getElementById("ai-chat").innerHTML += `<div class='text-sm text-white-950 mt-5 text-right bg-gray-600 p-2 mb-2 rounded-tl-xl rounded-tr-xl rounded-bl-xl message'>${text}</div>`;
  await fetch("/ai",{
    method: "POST",
    body: JSON.stringify({ message: text }),
  }).then(response => response.json())  // Parse the JSON response
  .then(data => {
    console.log(data);
    document.getElementById("ai-chat").innerHTML += `<div class='text-sm text-white-950 mt-5 text-left bg-gray-800 p-2 mb-2 rounded-tl-xl rounded-tr-xl rounded-br-xl message'>${data.result}</div>`;
  }).catch(e => {
    console.log(e)
  });
  
  
  document.getElementById("text").value = "";
})

document.getElementById("ai-chat").addEventListener("change",e=>{
  
});
function displayFileDetails(aiResponse, fileName, fileSize, fileHash) {
  document.getElementById("aiDesc").innerHTML = '<p id="aiDescP">' + aiResponse + '</p>';
  document.getElementById("fileName").innerHTML = 'Name: ' + fileName;
  document.getElementById("fileSize").innerHTML = 'Size: ' + Number(fileSize).toFixed(1) + ' MB';
  document.getElementById("fileHash").innerHTML = 'MD5 Hash: ' + fileHash;
}