"use scrict";

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
    let now = atDate || new Date();
    let segmentNumber = 0;
    let currentMs = now - startDate;

    while(segmentNumber <= interval.divisor) {

        var goTime = startDate.getTime() + ((segmentNumber * interval.segmentTime_min) * 60 * 1000)
        if(goTime >= now)
            return {
                "nextRun" : new Date(goTime),
                "segment" : segmentNumber,
                "now" : now
            };
        
        segmentNumber++;
    }

    return undefined;
}

let startDate = new Date(2017, 5, 1, 1, 0, 0);
//let atDate    = new Date(2017, 5, 1, 1, 1, 0);
let atDate    = new Date(2017, 5, 1, 2, 16, 0);


let interval = intervalCalc(30, 2.5, 60);
//let interval = intervalCalc(10, 2.5, 60);
//let interval = intervalCalc(20, 10, 4 * 60);

console.log(interval);
console.log("");
console.log(calculateNextRunTime(startDate, interval, atDate));