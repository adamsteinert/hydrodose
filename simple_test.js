"use strict";
const exec = require('child_process').exec;
const moment = require('moment');

// https://wiki.onion.io/Tutorials/Expansions/Using-the-OLED-Expansion


// DATA STRUCTURES
const testPump = {
		channel : 1,
        label : "Testing",
		estimatedRate_ml_min : 10,
		startTime : new moment("2017-05-31 00:06"),
		duration_min : 30,
		maxQuanityPerDay_ml : 100,
		enabled : true,

        // Represents the pump state for the current day or manual run.  
        // TODO: allow manual run to completely override daily?
        pumpState : {
            state : "Normal",
            isRunning : false,
            lastStarted : undefined,
            lastStopped : undefined,
            estimatedVolumeToday_ml : 0,
            estimatedVolumeCheckpoint : undefined
        }
	};

// CONSTANTS
const loopTimeoutInMs = 500; // Loop every 30 seconds
const maxQuantityOverrun_ml = 5;
let keepAlive = true;
let tick = new moment();

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


// Time calculations
let intervalCalc = function(targetVolume_ml, rate_ml_min, totalTimespan_min) {
    let capacity = rate_ml_min * totalTimespan_min;
    let totalMinToRun = targetVolume_ml / rate_ml_min;

    let runTime = totalMinToRun;
    let downTime = totalTimespan_min - totalMinToRun;
    let divisor = 1;

    // while the run time is greater than 2 minutes look for a smaller segment time
    while(runTime > 2) {
        divisor *= 2;
        runTime = totalMinToRun / divisor;
    }

    return {
        "divisor" : divisor,
        "upTime_min" : runTime,
        "downTime_min" : downTime / divisor,
        "segmentTime_min" : (runTime + (downTime / divisor))
    }
}

// uses interval and startDate to calculate the next run time.
// relative to forDate (or NOW if omitted)
//
// Depends on startDate being equal to the current date!!
// a return value of undefined indicates the current time is past the full run interval. 
// The date part of startDate should be incremented to today's date to get the next run time.
let calculateNextRunTime = function(startDate, interval, atDate) {
    let now = atDate || new moment();
    let segmentNumber = 0;
    let currentMs = now - startDate;
    let currentRunTime = undefined;

    while(segmentNumber <= interval.divisor) {

        //startDate.clone().add(segmentNumber * interval.segmentTime_min, 'm'); //
        var goTime = startDate.clone().add(segmentNumber * interval.segmentTime_min, 'm'); //startDate.valueOf() + ((segmentNumber * interval.segmentTime_min) * 60 * 1000)
        if(goTime > now)
            return {
                "now" : now,
                "thisRun" : (currentRunTime || goTime), //if now is before startDate thisRun and nextRun are equivalent, thisStop will accurately reflect the initial segment stop.
                "thisStop" : (currentRunTime || goTime).clone().add(interval.upTime_min, 'm'),
                "nextRun" : goTime,
                "segment" : segmentNumber
            };
        
        currentRunTime = goTime; // track the most recent run time to be set as 'thisRun' on the next go around if the time checks.
        segmentNumber++;
    }


    return undefined; 
}

// CORE DOSER LOGIC

let updateVolumeEstimate = function(pump) {
    if(pump.pumpState.isRunning) {
        let now = new moment();

        let minutesSinceLastCalc = now.diff(pump.pumpState.estimatedVolumeCheckpoint, 'milliseconds') / 1000 / 60;

        doser.log(now.format() + " " + pump.pumpState.estimatedVolumeCheckpoint.format() + " Rate: " + pump.estimatedRate_ml_min + " Rate: " + minutesSinceLastCalc );

        let newVolume = (minutesSinceLastCalc * pump.estimatedRate_ml_min);

        pump.pumpState.estimatedVolumeCheckpoint = now;
        pump.pumpState.estimatedVolumeToday_ml += newVolume;

        doser.log('New volume: ' + newVolume + ' (ml)');    
    }

    doser.log('Estimated volume: ' + pump.pumpState.estimatedVolumeToday_ml + ' (ml)');
}

let startPumpRunning = function(pump, runTime) {
    let now = new moment();
    // START THE PUMP
    pump.pumpState.isRunning = true;
    pump.pumpState.lastStarted = now;
    pump.pumpState.estimatedVolumeCheckpoint = now;

    doser.log("Pump STARTED! " + pump.pumpState.lastStarted.format() + " stop at " + runTime.thisStop.format());
}

let shutPumpDown = function(pump) {
    updateVolumeEstimate(pump);
    pump.pumpState.isRunning = false;

    pump.pumpState.lastStarted = undefined;
    doser.log("Pump STOPPED! " + new moment().format());
}

let processPump = function(pump) {
    const now = new moment();
    const tock = tick.clone().add(15, 's');

    const overMaxVolume = pump.pumpState.estimatedVolumeToday_ml > (pump.maxQuanityPerDay_ml + maxQuantityOverrun_ml);

    if(overMaxVolume) {
        doser.setPower(pump, false); // OFF!!
        return;
    }    

    // Calculate the interval and run time.
    const interval = intervalCalc(pump.maxQuanityPerDay_ml, pump.estimatedRate_ml_min, pump.duration_min);
    const runTime = calculateNextRunTime(pump.startTime, interval);

    //TODO: if runtime is undefined, increment startDate and save to disk

    if(tock < now) {
        tick = now;
    }

    // Pump is running, estimate new volume
    if (pump.pumpState.isRunning) {
        if(tock < now) {
            updateVolumeEstimate(pump);
        }

        if(now > runTime.thisStop) {
            shutPumpDown(pump);
        }        
    }
    // Pump is NOT running, Check for startup state.
    else  {
        if(runTime 
            && runTime.thisRun < now
            && now < runTime.thisStop   // don't start prematurely
            //&& pump.pumpState.lastStarted < runTime.thisRun 
            && !pump.pumpState.isRunning) {

            doser.log("GO!");
            doser.log(interval);
            doser.log(runTime);
            startPumpRunning(pump, runTime);
        }
        else {
            //doser.log("Don't run yet.");
        }
    }
}


// Iterate over all pumps and set new state.
let coreLoop = function() {
    if (keepAlive) {

        // Review status of each pump and set state as necessary.
        pumps.forEach(processPump, this);

        // resume the loop after a wait.
        let keepAlive = setTimeout(coreLoop, loopTimeoutInMs);    
    }
}


pumps.forEach(function(pump) {
    let now = new moment();
    pump.startTime.year(now.year());
    pump.startTime.month(now.month());
    pump.startTime.date(now.date());
    
    doser.log("Initialize pump Channel " + pump.channel + " " + pump.label );
    doser.log("Start time: " + pump.startTime.format() );

    const interval = intervalCalc(pump.maxQuanityPerDay_ml, pump.estimatedRate_ml_min, pump.duration_min);
    const runTime = calculateNextRunTime(pump.startTime, interval);

    doser.log(interval);
    doser.log(runTime);
}, this);

// Entry point
coreLoop();
//coreLoop();
//let loopInterval = setInterval(coreLoop, loopTimeoutInMs);

