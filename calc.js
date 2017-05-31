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
// atDate is for debugging and should be removed in production
// Depends on startDate being equal to the current date
let calculateNextRunTime = function(startDate, interval, atDate) {
    let now = atDate || new moment();
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

let startDate = new moment("2017-05-01 08:00");
let atDate    = new moment("2017-05-01 08:01");
//let atDate    = new Date("2017-05-01 08:00");


let interval = intervalCalc(30, 2.5, 60);
// //let interval = intervalCalc(10, 2.5, 60);
// //let interval = intervalCalc(20, 10, 4 * 60);

// console.log(interval);
// console.log("");
console.log(calculateNextRunTime(startDate, interval, atDate));