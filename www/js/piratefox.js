/*\
|*|
|*|  Define globals.
|*|
\*/

var filenumber = 1; // tracks the file we're processing; iterated every file upload
var connected = false; // true = connected to a PirateBox; false = not connected

/*\
|*|
|*|  We start off by looking to see if a PirateBox is connected...
|*|
\*/

isPirateBox();

/*\
|*|
|*|  Bind to UI elements.
|*|
\*/

/**
* Bind to a tap on a Select a File button. 
*/
$('#selectfile').bind('click', function() {
    selectFile();
});

/**
* Bind to a tap on a "Yes" on the "No PirateBox found"
* dialog to the try again.
*/
$('#lookagain').bind('click', function() {
    isPirateBox();
});

/*\
|*|
|*|  Bind to mozSetMessageHandler.
|*|
|*|  This is how we support the "share" activity from *other* apps.
|*|
\*/

navigator.mozSetMessageHandler('activity', function(activityRequest) {
  var option = activityRequest.source;
  if (option.name === "share") {
    uploadFile(option.data.blobs[0]);
  }
});

/*\
|*|
|*|  The heavy lifting of sending the selected file to the PirateBox.
|*|  
|*|  Because current Firefox OS devices are using Firefox 18, which cannot send
|*|  filename as the third parameter of FormData, we hand-stich together the
|*|  POST to the PirateBox rather than relying on the convenience of FormData.
|*|
\*/

/**
* When the user taps on the "Select a File" button, we use the MozActivity to allow
* them to select an audio or video file. 
*/
function selectFile() {

  // This pops up a "file picker" that allows user to select an object from their device.
  // It appears to only allow for images on current Firefox OS devices, even though the
  // Simulator allows audio and contact files to be selected. Not sure why.
  var activity = new MozActivity({
     name: "pick",
     data: {
         type: ["image/png", "image/jpg", "image/jpeg", "audio/mpeg", "audio/mp4", "audio/ogg", "video/mp4", "video/3gpp", "application/pdf" ]
      }
  });

  activity.onsuccess = function () {
    uploadFile(this.result.blob);
  };
  
  // Display an alert if we cancel the file picker operation.
  pick.onerror = function () {
    alert("No file selected.");
  };
}

/**
* Handles the upload of the file.
*/
function uploadFile(payload) {

  // We need a way of figuring out what to name the file when
  // we send it to the PirateBox.
  
  // Maybe the blob that gets returned has a name? If so, we'll use that.
  if (payload.name) {
    filename = payload.name.replace(/^.*[\\/]/, '');
    filetype = payload.type;
  }
  // If all else fails, we'll use generic filenames.
  else if (payload.type == "audio/mpeg") {
    filename = "audiofile.mp3";
    filetype = payload.type;
  }
  else if (payload.type == "audio/ogg") {
    filename = "audiofile.ogg";
    filetype = payload.type;
  }
  else if (payload.type == "video/mp4") {
    filename = "videofile.mp4";
    filetype = payload.type;
  }
  else if (payload.type == "video/3gpp") {
    filename = "videofile.3gpp";
    filetype = payload.type;
  }
  else if (payload.type == "application/pdf") {
    filename = "document.pdf";
    filetype = payload.type;
  }
  else if (payload.type == "image/jpg") {
    filename = "image.jpg";
    filetype = payload.type;
  }
  else if (payload.type == "image/jpeg") {
    filename = "image.jpg";
    filetype = payload.type;
  }
  else if (payload.type == "image/png") {
    filename = "image.png";
    filetype = payload.type;
  }

  // We need a "progress indicator" on the main screen for this
  // file, so we append one to the #uploadedfiles and we can later
  // refer to the progress bar as uploadprogressX where X is a
  // consecutive number that we iterate every upload.
  content = '<li class="uploadedfile" id="filenumber' + filenumber + '" name="filenumber' + filenumber + '"><p>' + filename + '</p><progress id="uploadprogress' + filenumber + '" value="0" max="100"></progress></li>';
  $(content).appendTo("#uploadedfiles");     
  
  // We start off the upload process by instantiating a new XMLHttpRequest.
  // the "mozSystem: true" bit is the magic that allows the app, because
  // it has the "systemXHR" permission in its manifest, to bypass cross-
  // site scripting issues.
  var xhr = new XMLHttpRequest({mozSystem: true});

  // A function that receives progress updates from the XMLHttpRequest
  // which we use to update the progress indicator we created earlier.
  xhr.upload.onprogress = function(e) {
    if (e.lengthComputable) {
      var percentComplete = (e.loaded / e.total) * 100;
      $("#uploadprogress" + filenumber).attr("value",percentComplete);
    }
  };

  // A function that fires when the upload is complete. We set the
  // upload progress to 100% and flash a status message in the 
  // footer for 3 seconds via a call to showStatusMessage(). Also
  // iterate the filenumber variable so we can upload another file.
  xhr.onload = function(e) {
    showStatusMessage("File uploaded.");
    $("#uploadprogress" + filenumber).attr("value",100);
    filenumber++;
  };

  // We're going to create a POST by hand-stitching it together. You
  // know all about this if you've dealt with MIME messages in email.
  // First we need a "boundary" string, which must not occur within the
  // binary data we're going to upload, so we make it random.
  var filenameTimestamp = (new Date().getTime());
  var separator = "----------12345-multipart-boundary-" + filenameTimestamp;

  // Open to portal to the Piratebox's Droppy process which, for the time-being
  // is hard-coded as running at piratebox.lan:8080.
  xhr.open("POST", "http://piratebox.lan:8080/");
  
  // Set the header to reflect that we're POSTing a multipart/form-data, and tell
  // the server what the boundary that we set up earlier is.
  xhr.setRequestHeader("Content-Type", "multipart/form-data; boundary=" + separator)

  // Assemble the payload that we're going to POST. It consists of the boundary,
  // followed by a Content-Disposition and a Content-Type header.
  var data = '';
  data = data + '--' + separator + "\r\n";
  data = data + 'Content-Disposition: form-data; name="upfile"; filename="' + filename + '"' + "\r\n";
  data = data + 'Content-Type: ' + filetype + '"' + "\r\n\r\n";

  // To actually grab and send the binary payload we use FileReader() and attach
  // a "loadend" triggered-event to it so that once the file is read we can proceed
  // with the upload. 
  var reader = new FileReader();

  // Once the file has been read, proceed with the upload.
  reader.addEventListener("loadend", function() {
    // Add the file's binary data to the payload.
    data = data + reader.result;
    // Append the boundary at the end.
    data = data + "\r\n--" + separator + "--\r\n";
    // Add a Content-length header, which tells the server the
    // length of the payload, which is boundaries + inner headers.
    xhr.setRequestHeader("Content-length", data.length)
    // Send the resulting payload as binary data.
    xhr.sendAsBinary(data);
  });

  // Read the blob that we selected as a binary string; the "loadend"
  // that we define above will be triggered when the blob is read.
  reader.readAsBinaryString(payload);
}

/*\
|*|
|*|  See if there's a PirateBox nearby.
|*|
|*|  We do this by assuming that if we can find http://piratebox.lan/ncsi.txt
|*|  then we're connected to a PirateBox. It's not perfect, but it's something!
|*|
\*/

function isPirateBox() {

	var xhr = new XMLHttpRequest({mozSystem: true, responseType: 'text', timeout: 2000});

  xhr.onload = function(e) {
		if (xhr.status === 200 && xhr.readyState === 4) {
      showStatusMessage("Connected to PirateBox.");
      $('#selectfile').removeAttr("disabled");
      $('#notfound-view').removeClass('move-up');
      $('#notfound-view').addClass('move-down');
      connected = true;
      return true;
    }
  };

  xhr.onerror = function(e) {
    $('#notfound-view').removeClass('move-down');
    $('#notfound-view').addClass('move-up');
    return false;
  };

  xhr.onabort = function(e) {
    $('#notfound-view').removeClass('move-down');
    $('#notfound-view').addClass('move-up');
    return false;
  };

	xhr.open('GET', "http://piratebox.lan/ncsi.txt", false);
  try {
    xhr.send();
  }
  catch(e) {
    $('#notfound-view').removeClass('move-down');
    $('#notfound-view').addClass('move-up');
  }
}

/*\
|*|
|*|  Utility Functions
|*|
\*/

/**
* Show the "status message" on the main screen.
*/  
function showStatusMessage(message) {
    $('#statusmessagetext').html(message);
    $('#statusmessage').show('slow');
    setTimeout(function() { $('#statusmessage').hide('slow'); },3000);
}
