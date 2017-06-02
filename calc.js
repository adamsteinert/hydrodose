"use scrict";
var moment = require('moment');

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
let calculateNextRunTime = function(startDate, interval, forDate) {
    let now = forDate || new moment();
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


let startDate = new moment("2017-05-01 08:00");
let atDate    = new moment("2017-06-01 07:00");
//let atDate    = new Date("2017-05-01 08:00");

let interval = intervalCalc(30, 2.5, 60);
// //let interval = intervalCalc(10, 2.5, 60);
// //let interval = intervalCalc(20, 10, 4 * 60);

console.log(interval);
console.log("X");
console.log(calculateNextRunTime(startDate, interval, atDate));


console.log(new moment("2017-06-01 08:23:34.234").diff(new moment("2017-06-01 07:00"), 'milliseconds') / 1000 / 60);