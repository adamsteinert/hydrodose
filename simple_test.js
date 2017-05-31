"use strict";
const exec = require('child_process').exec;
const moment = require('moment');

// https://wiki.onion.io/Tutorials/Expansions/Using-the-OLED-Expansion

const time = new Date();
// DATA STRUCTURES
const testPump = {
		channel : 1,
		estimatedRate_ml_min : 5,
		startTime : new moment("2017-05-31 00:00"),
		duration_min : 120,
		maxQuanityPerDay_ml : 100,
		enabled : true,

        // Represents the pump state for the current day or manual run.  
        // TODO: allow manual run to completely override daily?
        pumpState : {
            state : "Normal",
            isRunning : false,
            lastStarted : new moment("2017-05-29 08:00"),
            stopAt : undefined,
            stateForDay : new moment(),            
            estimatedVolumeToday_ml : 0,
            estimatedVolumeCalculatedAt : new moment()
        }
	};

// CONSTANTS
let keepAlive = true;
let loopTimeoutInMs = 500; // Loop every 30 seconds
let runEvery_Minutes = 1;
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
// atDate is for debugging and should be removed in production
// Depends on startDate being equal to the current date
let calculateNextRunTime = function(startDate, interval) {
    let now = new moment();
    let segmentNumber = 0;
    let currentMs = now - startDate;
    let currentRunTime = undefined;

    while(segmentNumber <= interval.divisor) {

        var goTime = startDate.valueOf() + ((segmentNumber * interval.segmentTime_min) * 60 * 1000)
        if(goTime >= now)
            return {
                "thisRun" : currentRunTime,
                "nextRun" : new moment(goTime),
                "segment" : segmentNumber,
                "now" : now
            };
        
        currentRunTime = new moment(goTime); // track the most recent run time to be set as 'thisRun' on the next go around if the time checks.
        segmentNumber++;
    }

    return undefined;
}

// CORE DOSER LOGIC

let getVolumeSinceLastCheck = function(pump) {
    const isToday = (pump.pumpState.StateForDay === new moment());
    if(pump.isRunning && isToday) {
        var minutesSinceLastCalc 
            = (new moment() - pump.pumpState.timeSinceLastCalc).valueOf()
              / (1000 / 60);

        return minutesSinceLastCalc * pump.estimatedRate_ml_min;
    }
    else {
        return 0;
    }
}

let updateVolumeEstimate = function(pump) {
    pump.pumpState.estimatedVolumeCalculatedAt = new moment();
    pump.pumpState.estimatedVolumeToday_ml += getVolumeSinceLastCheck(pump);   
}

let startPumpRunning = function(pump, interval) {
    // START THE PUMP
    pump.pumpState.isRunning = true;
    pump.pumpState.lastStarted = new moment();
    pump.pumpState.stopAt = pump.pumpState.lastStarted.clone().add(interval.upTime_min, 'm');

    doser.log("Pump STARTED! " + pump.pumpState.lastStarted.format() + " stop at " + pump.pumpState.stopAt.format());

    // let shutdown = setTimeout(function() {
    //     shutPumpDown(pump, interval);
    // }, interval.upTime_min * 60 * 1000);

    //setTimeout(shutPumpDown, interval.upTime_min * 60 * 1000, pump, interval);   
}

let shutPumpDown = function(pump) {
    pump.pumpState.isRunning = false;
    doser.log("Pump STOPPED! " + new moment().format());
}

let processPump = function(pump) {
    const now = new moment();
    const tock = tick.clone().add(10, 's');

    const isToday = (pump.pumpState.StateForDay === new moment());
    const overMaxVolume = pump.pumpState.estimatedVolumeToday_ml > pump.maxQuanityPerDay_ml;

    if(overMaxVolume) {
        doser.setPower(pump, false); // OFF!!
        return;
    }    

    // Pump is running, estimate new volume
    if (pump.pumpState.isRunning) {
        //updateVolumeEstimate(pump);

        if(tock < now) {
            doser.log(now.format() + "Running: " + pump.startTime.format() + " to " + pump.pumpState.stopAt.format());
            tick = now;
        }        

        if(pump.pumpState.stopAt >= now) {
            shutPumpDown(pump);
        }        
    }
    // Pump is NOT running, Check for startup state.
    else  {
        const interval = intervalCalc(pump.maxQuanityPerDay_ml, pump.estimatedRate_ml_min, pump.duration_min);
        const runTime = calculateNextRunTime(pump.startTime, interval);

        if(tock < now) {
            doser.log("-||- using start time " + pump.startTime.format())        
            doser.log(interval);
            doser.log(runTime);
            doser.log("____");

            tick = now;
        }

        if(runTime 
            && runTime.thisRun < new moment() 
            && pump.pumpState.lastStarted < runTime.thisRun 
            && !pump.pumpState.isRunning) {

            doser.log("GO!");
            startPumpRunning(pump, interval);
        }
        else {
            doser.log("Don't run yet.");
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


// Entry point
//coreLoop();
coreLoop();
//let loopInterval = setInterval(coreLoop, loopTimeoutInMs);