﻿onmessage = function(e) {
	
	var progress_percent = 0;
	var progress_percent_old = 0;
	var buffers = e.data.buffer;
  
	var width = e.data.width;
  
	var loudness = new Float32Array(width);
	var psr = new Float32Array(width);

	console.log("Starting with analysing loudness");
  
	//calculate a short term loudness value for each "pixel" of canvas
	for (var i = 0; i < width; i++){
		
		var absoluteSamplePos = Math.round(i/width * buffers[0].length);
		loudness[i] = getShortTermLoudnessAtSamplePosition(buffers, absoluteSamplePos);
		psr[i] = getPSRAtSamplePosition(buffers, absoluteSamplePos, loudness[i]);
	
		progress_percent = Math.round(i/width * 100);
	
		if (progress_percent != progress_percent_old){
			postMessage({type: "progress", progress: progress_percent});
			progress_percent_old = progress_percent;	
		}
	
	}

  
	var response = {
	  
		type: "finished",
		loudness: loudness,
		psr: psr
	
	}
  
	postMessage(response);
  
}


function absoluteValueToDBFS(value){

	return 20 * Math.log10(Math.abs(value));	

}

function msInDBFS(value){

	return 10 * Math.log10(Math.abs(value));	

}


function getAbsMaxOfArray(numArray){

  //return Math.max.apply(null, numArray);
  //this will result in "Uncaught RangeError: Maximum call stack size exceeded"
  
	var max_pos = 0;
  
	for (var i=1; i < numArray.length; i++){
  
		if (Math.abs(numArray[i]) > Math.abs(numArray[max_pos])){
			max_pos = i;
		}
  
	}
  
	return Math.abs(numArray[max_pos]);

}


function getMaxOfArray(numArray) {
  //return Math.max.apply(null, numArray);
  //this will result in "Uncaught RangeError: Maximum call stack size exceeded"
  
	var max_pos = 0;
  
	for (var i=1; i < numArray.length; i++){
  
		if (numArray[i] > numArray[max_pos]){
			max_pos = i;
		}
  
	}
  
	return numArray[max_pos];
  
}


function getShortTermLoudnessAtSamplePosition(buffers, pos){

	// From EBU TECH 3341:
	// The short-term loudness uses a sliding rectangular time window of length 3 s. The
	// measurement is not gated. The update rate for ‘live meters’ shall be at least 10 Hz.
	var time_frame = 3; //seconds
	var samplesCount = Math.round(48000 * time_frame);

	//for every channel one loudness value
	var channel_loudness_values = new Float32Array(buffers.length);
	
	//master loudness
	var loudness = 0;
	
	//calculate loudness for each channel
	for (var c = 0; c < buffers.length; c++){
	
		var samplesForCalculation = new Float32Array(samplesCount);
		var i = 0;
		
		for (var s = pos - samplesCount; s <= pos; s++){
		
			if (s >= 0){

				samplesForCalculation[i] = buffers[c][s];

			}
		
			else {
				samplesForCalculation[i] = 0;
			}
		
			i++;
			
		}
		
		channel_loudness_values[c] = ebuPreFilter(samplesForCalculation);
		
		/*
			No channel weigthing applied here, as we're currently only evaluation mono/stereo files with L=1.0 and R=1.0
		*/
		
		loudness += channel_loudness_values[c];
		
	}
	
	var l_db = msInDBFS(loudness);
	
	return l_db;

}


function getPSRAtSamplePosition(buffers, samplePos, loudness_value){

	var time_frame = 3; //seconds
	var samplesCount = Math.round(48000 * time_frame);

	var length = buffers[0].length;

	//put all samples of all channels in one array
	var samples = new Float32Array(buffers.length * samplesCount);
	var i = 0;
	
	for (var c = 0; c < buffers.length; c++){
	
		for (var s = samplePos - samplesCount; s <= samplePos; s++){
		
			if (s >= 0){

				samples[i] = buffers[c][s];

			}
		
			else {
				samples[i] = 0;
			}
		
			i++;
			
		}
	
	}
	
	var x_peak = getAbsMaxOfArray(samples);
	
	var x_peak_db = absoluteValueToDBFS(x_peak);
	
	var c = x_peak_db - loudness_value;
	
	return c;


}


function ebuPreFilter(samples){

	return ms(highPassFilter(sphericalHeadFilter(samples)));

}


function highPassFilter(samples){

	var b0 = 1.0;
	var b1 = -2.0;
	var b2 = 1.0;
	var a1 = -1.99004745483398;
	var a2 = 0.99007225036621;
	
	return biquadFilter(samples, b0, b1, b2, a1, a2);

}


function sphericalHeadFilter(samples){

	var b0 = 1.53512485958697;
	var b1 = -2.69169618940638;
	var b2 = 1.19839281085285;
	var a1 = -1.69065929318241;
	var a2 = 0.73248077421585;

	return biquadFilter(samples, b0, b1, b2, a1, a2);

}


function biquadFilter(samples, b0, b1, b2, a1, a2){

	var array = new Float32Array(samples);

	for (var z = 0; z < samples.length; z++){
		
		var z_0 = samples[z];
		
		if (z > 0){
			var z_1 = samples[z-1];
		}
		
		else {
			z_1 = 0;
		}
		
		if (z > 1){
			var z_2 = samples[z-2];
		}
		
		else {
			z_2 = 0;
		}
		
		var part1 = (b0*z_0) + (b1*z_1) + (b2*z_2);
		var part2 = (a1*z_1) + (a2*z_2);
		
		var result = part1 - part2;
		
		array[z] = result;
	
	}
	
	return array;


}


function ms(samples){

	var squared_samples = 0;
	
	for (var s = 0; s < samples.length; s++){
	
		squared_samples += Math.pow(samples[s], 2);
	
	}
	
	var ms = (1 / samples.length) * squared_samples;
	
	return ms;
	
}


function sumSignals(signal1, signal2){

	var combined = new Float32Array(Math.min(signal1.length, signal2.length));
	
	for (var i = 0; i < combined.length; i++){
		combined[i] = (signal1[i] + signal2[i]); // NOT divided by 2!
	}
	
	return combined;

}