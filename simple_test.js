"use strict";
const exec = require('child_process').exec;

// https://wiki.onion.io/Tutorials/Expansions/Using-the-OLED-Expansion

const time = new Date();
// DATA STRUCTURES
const testPump = {
		channel : 1,
		estimatedRate_Ml_Min : 5,
		startTime : new Date(),
		endTime : new Date(),
		maxQuanityPerDay_Ml : 100,
		enabled : true,

        // Represents the pump state for the current day or manual run.  
        // TODO: allow manual run to completely override daily?
        pumpState : {
            state : "Normal",
            isRunning : false,
            nextStartMinute : 0,
            stateForDay : new Date(),            
            estimatedVolumeToday_Ml : 0,
            estimatedVolumeCalculatedAt : new Date()
        }
	};

// CONSTANTS
let keepAlive = true;
let loopTimeoutInMs = 1000 * 60; // Loop every minute
let runEvery_Minutes = 1;

// CONDITIONAL OBJECTS
let testDoser = function() {
    this.log = function(message) {
        console.log(message);
    }

    this.init = function() {
        this.log("Initialized");
    }
    
    this.setPower = function(pump, boolState) {
        this.log("PUMP " + pump.channel + "| SET POWER to " + boolState);
    }
}

let liveDoser = function() {
    this.log = function(message) {
    	exec('oled-exp cursor 0,0');
        exec('oled-exp write "' + message + '"');
    }

    this.init = function() {
        exec('oled-exp -i -c');
    }

    this.setPower = function(boolState) {
        //TODO: Write GPIO
        this.log("PUMP " + pump.channel + "| SET POWER to " + boolState);
    }
}


// CONFIGURABLE OBJECT DEFINITIONS
let doser = new testDoser();
let pumps = new Array(); pumps.push(testPump);


// CORE DOSER LOGIC

let getVolumeSinceLastCheck = function(pump) {
    const isToday = (pump.pumpState.StateForDay === new Date());
    if(pump.isRunning && isToday) {
        var minutesSinceLastCalc 
            = (new Date().getTime() - pump.pumpState.timeSinceLastCalc.getTime())
                / (1000 / 60);

        return minutesSinceLastCalc * pump.estimatedRate_Ml_Min;
    }
    else {
        return 0;
    }
}

let updateVolumeEstimate = function() {
    pump.pumpState.estimatedVolumeCalculatedAt = new Date();
    pump.pumpState.estimatedVolumeToday_Ml += getVolumeSinceLastCheck(pump);   
}

let checkForPumpOnState = function() {
    
}

let processPump = function(pump) {
    const isToday = (pump.pumpState.StateForDay === new Date());
    const overMaxVolume = pump.pumpState.estimatedVolumeToday_Ml > pump.maxQuanityPerDay_Ml;

    if(overMaxVolume) {
        doser.setPower(pump, false); // OFF!!
        return;
    }    

    // Pump is running, estimate new volume
    if (pump.pumpState.isRunning) {
        updateVolumeEstimate(pump);
    }
    // Pump is NOT running, Check for startup state.
    else  {
        
    }
}

// Iterate over all pumps and set new state.
let coreLoop = function() {
    if (keepAlive) {

        // Review status of each pump and set state as necessary.
        pumps.forEach(processPump, this);

        // resume the loop after a wait.
        setTimeout(coreLoop, loopTimeoutInMs);    
    }
}


// Entry point
coreLoop();