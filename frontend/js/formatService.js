function formatName(item) {

  const firstName = item.firstName;
  const middleName = item.middleName;
  const lastName = item.lastName;

  if (!firstName && !middleName && lastName) {
    return lastName;
  } else if (firstName && !middleName && lastName) {
    return `${firstName} ${lastName}`;
  } else if (firstName && middleName && lastName) {
    return `${firstName} ${middleName.charAt(0)}. ${lastName}`;
  } else if (firstName && !lastName) {
    return firstName;
  } else {
    return '';
  }
}

function formatInstitution(item) {

  const label = item.label;
  const rorID = item.rorId;

  if (label && rorID) {
    return `${label}, ${rorID}`;
  } else if (!label && rorID) {
    return `${rorID}`;
  } else if (label && !rorID) {
    return `${label}`;
  } else {
    return '';
  }
}

function formatLiterature(item) {

  const authorList = item.authorList;
  const publicationYear = item.publicationYear;
  const title = item.title;

  // authors
  let authorStr = "";
  if (authorList.length === 1) {
    authorStr = formatName(authorList[0])
  } else if (authorList.length === 2) {
    authorStr = `${formatName(authorList[0])} & ${formatName(authorList[1])}`;
  } else if (authorList.length > 2) {
    authorStr = `${formatName(authorList[0])} et al.`;
  }

  // no author -> title (year)
  if (authorList.length === 0 && publicationYear && title) {
    return `${title} (${publicationYear})`;
  }
  
  // no year -> authors: title
  if (authorList.length > 0 && !publicationYear && title) {
    return `${authorStr}: ${title}`;
  }
  
  // no title -> authors (year)
  if (authorList.length > 0 && publicationYear && !title) {
    return `${authorStr} (${publicationYear})`;
  }
  
  // no author and year -> title
  if (authorList.length === 0 && !publicationYear && title) {
    return `${title}`;
  }

  // authors (year): title
  if (authorList.length > 0 && publicationYear && title) {
    return `${authorStr} (${publicationYear}): ${title}`;
  } else { 
    return "";
  }
}

function formatFraction(item) {

  const orgOrMin = item.orgOrMin.toUpperCase();
  const sieveSize = item.sieveSize;
  const fractionAnalyzed = item.fractionAnalyzed;
  const standardMultiplier = item.standardMultiplier;

  return `${orgOrMin}` +
    `${sieveSize ? ` ${sieveSize}` : ''}` +
    `${fractionAnalyzed ? ` ${fractionAnalyzed}` : ''}`
    // + `${standardMultiplier ? ` (standard multiplier: ${standardMultiplier})` : ''}`
}

// function formatDendroDating(item) {

//   const lab = item.laboratory?.label;
//   const num = item.number;
//   const age = item.dendrochronologicalAge;
//   const waneyEdge = item.waneyEdge;

//   // Lab + num
//   const prefix = [lab, num].filter(Boolean).join(' ');

//   return (
//     prefix +
//     (age && prefix ? ', ' : '') +
//     `${age ? `age: ${age ?? 'undefined'}` : ''}` +
//     `${waneyEdge === true ? ' (waneyEdge)' : ''}`
//   );
// }

// function formatC14Dating(item) {

//   const c14lab = item.c14Laboratory?.label;
//   const num = item.number;

//   const c14AgeBp = item.c14AgeBp;
//   const c14StdDev = item.c14StdDev;

//   const c14CalibrationBcAd2s = item.c14CalibrationBcAd2s;

//   const deltaC13 = item.deltaC13;
//   const deltaC13Uncertainty = item.deltaC13Uncertainty;

//   const pmc = item.pmc;
//   const pmcUncertainty = item.pmcUncertainty;

//   // Lab + num
//   const prefix = [c14lab, num].filter(Boolean).join(' ');

//   return (
//     prefix +
//     (c14AgeBp && prefix ? ', ' : '') +
//     `${c14AgeBp ? `C14-age BP: ${c14AgeBp} ± ${c14StdDev}` : ''}` +
//     `${c14CalibrationBcAd2s ? `, C14 cal BC/AD (2s): ${c14CalibrationBcAd2s}` : ''}` +
//     `${deltaC13 ? `, Delta C13: ${deltaC13} ± ${deltaC13Uncertainty}` : ''}` +
//     `${pmc ? `, pMC: ${pmc} ± ${pmcUncertainty}` : ''}`
//   );
// }

// function formatOtherDating(item) {

//   const lab = item.laboratory?.label;
//   const num = item.number;
//   const age = item.ageDivers;

//   // Lab + num
//   const prefix = [lab, num].filter(Boolean).join(' ');

//   return (
//     prefix +
//     (age && prefix ? ', ' : '') +
//     `${age ? `age: ${age ?? 'undefined'}` : ''}`
//   );
// }

function formatDatings(item) {
  return item.subSample
}
