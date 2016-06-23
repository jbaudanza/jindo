function distanceOfTimeInWords(distanceInMilliseconds) {
  if (!isFinite(distanceInMilliseconds)) {
    return ''
  }

  const distanceInMinutes = Math.round(Math.abs(distanceInMilliseconds / 60000));

  if (distanceInMinutes === 0) {
    return "less than a minute";
  } else if (distanceInMinutes === 1) {
    return "1 minute";
  } else if (distanceInMinutes < 45) {
    return distanceInMinutes + " minutes";
  } else if (distanceInMinutes < 90) {
    return "about 1 hour";
  } else if (distanceInMinutes < 1440) {
    return "about " + Math.round(distanceInMinutes / 60) + " hours";
  } else if (distanceInMinutes < 2160) {
    return "about 1 day";
  } else if (distanceInMinutes < 43200) {
    return Math.round(distanceInMinutes / 1440) + " days";
  } else if (distanceInMinutes < 86400) {
    return "about 1 month";
  } else if (distanceInMinutes < 525600) {
    return Math.round(distanceInMinutes / 43200) + " months";
  } else if (distanceInMinutes < 1051200) {
    return "about 1 year";
  } else {
    return "over " + Math.round(distanceInMinutes / 525600) + " years";
  }
};

module.exports = distanceOfTimeInWords;
