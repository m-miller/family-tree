// JSON to GEDCOM 7.0 Converter
// This script converts a genealogical JSON structure to GEDCOM 7.0 format

/**
 * Convert the provided JSON structure to GEDCOM 7.0 format
 * @param {Object} jsonData - The genealogical JSON data to convert
 * @returns {String} - GEDCOM 7.0 formatted text
 */
function convertJsonToGedcom(jsonData) {
  let gedcom = [];
  let idMap = new Map(); // To track JSON objects to GEDCOM IDs
  let familyCounter = 1;
  
  // Add GEDCOM header
  gedcom.push("0 HEAD");
  gedcom.push("1 GEDC");
  gedcom.push("2 VERS 7.0");
  gedcom.push("1 CHAR UTF-8");
  gedcom.push("1 DATE " + new Date().toISOString().split('T')[0].replace(/-/g, ' '));
  gedcom.push("1 FILE genealogy.ged");
  
  // Process individuals first
  processIndividuals(jsonData, gedcom, idMap);
  
  // Process families
  processFamilies(jsonData, gedcom, idMap, familyCounter);
  
  // Add trailer
  gedcom.push("0 TRLR");
  
  return gedcom.join("\n");
}

/**
 * Process individual records from JSON to GEDCOM format
 */
function processIndividuals(jsonData, gedcom, idMap) {
  // Start with the main person and recursively process all connected individuals
  processIndividual(jsonData[0], gedcom, idMap, 1);
}

/**
 * Process a single individual record
 */
function processIndividual(person, gedcom, idMap, id) {
  if (!person) return null;
  
  // Check if we've already processed this person
  if (idMap.has(person)) {
    return idMap.get(person);
  }
  
  // Create a new GEDCOM ID for this person
  const gId = `@I${id}@`;
  idMap.set(person, gId);
  
  // Create the individual record
  gedcom.push(`0 ${gId} INDI`);
  
  // Add name
  const nameLastPattern = /(.+) \/(.+)\//;
  const nameMatch = person.name ? person.name.match(nameLastPattern) : null;
  
  if (nameMatch) {
    // Name is already in GEDCOM format with slashes
    gedcom.push(`1 NAME ${person.name}`);
  } else if (person.name) {
    // Need to format the name
    gedcom.push(`1 NAME ${person.name.replace(/^(.+) ([^ ]+)$/, "$1 /$2/")}`);
  }
  
  // Add gender/sex
  if (person.class) {
    const sex = person.class === "man" ? "M" : person.class === "woman" ? "F" : "U";
    gedcom.push(`1 SEX ${sex}`);
  }
  
  // Process birth information
  if (person.extra && (person.extra.birthdate || person.extra.birth_city)) {
    gedcom.push("1 BIRT");
    
    if (person.extra.birthdate && person.extra.birthdate !== "unknown") {
      gedcom.push(`2 DATE ${formatDate(person.extra.birthdate)}`);
    }
    
    // Process birth place
    const birthPlace = formatPlace(
      person.extra.birth_city,
      person.extra.birth_state_province,
      person.extra.birth_country
    );
    
    if (birthPlace) {
      gedcom.push(`2 PLAC ${birthPlace}`);
    }
  }
  
  // Process death information
  if (person.extra && (person.extra.deathdate || person.extra.death_city)) {
    gedcom.push("1 DEAT");
    
    if (person.extra.deathdate && person.extra.deathdate !== "unknown") {
      gedcom.push(`2 DATE ${formatDate(person.extra.deathdate)}`);
    }
    
    // Process death place
    const deathPlace = formatPlace(
      person.extra.death_city,
      person.extra.death_state_province,
      person.extra.death_country
    );
    
    if (deathPlace) {
      gedcom.push(`2 PLAC ${deathPlace}`);
    }
  }
  
  // Process burial information
  if (person.extra && person.extra.buried) {
    gedcom.push("1 BURI");
    gedcom.push(`2 PLAC ${person.extra.buried}`);
    
    if (person.extra.buried_grave) {
      gedcom.push("2 NOTE " + person.extra.buried_grave.replace(/\n/g, "\n3 CONT "));
    }
  }
  
  // Add notes
  if (person.extra && person.extra.notes) {
    gedcom.push(`1 NOTE ${person.extra.notes.replace(/\n/g, "\n2 CONT ")}`);
  }
  
  // Process children and marriages recursively
  if (person.marriages && Array.isArray(person.marriages)) {
    // Process each spouse and their children
    person.marriages.forEach((marriage, idx) => {
      // Process spouse if present
      if (marriage.spouse) {
        const spouseId = processIndividual(marriage.spouse, gedcom, idMap, id + idx + 1);
        
        // Process children
        if (marriage.children && Array.isArray(marriage.children)) {
          marriage.children.forEach((child, childIdx) => {
            processIndividual(child, gedcom, idMap, id + idx + marriage.children.length + childIdx + 1);
          });
        }
      }
    });
  }
  
  return gId;
}

/**
 * Process family relationships from the JSON data
 */
function processFamilies(jsonData, gedcom, idMap, familyCounter) {
  // Start with the main person and process all family relationships
  processFamilyRelationships(jsonData[0], gedcom, idMap, familyCounter);
}

/**
 * Process family relationships for a single individual
 */
function processFamilyRelationships(person, gedcom, idMap, familyCounter) {
  if (!person || !idMap.has(person)) return;
  
  // Get the individual's GEDCOM ID
  const indId = idMap.get(person);
  
  // Only process marriages for individuals we haven't processed yet
  if (person.marriages && Array.isArray(person.marriages)) {
    person.marriages.forEach((marriage) => {
      if (marriage.spouse && idMap.has(marriage.spouse)) {
        const spouseId = idMap.get(marriage.spouse);
        const famId = `@F${familyCounter++}@`;
        
        // Create family record
        gedcom.push(`0 ${famId} FAM`);
        
        // Link husband and wife based on their class
        if (person.class === "man") {
          gedcom.push(`1 HUSB ${indId}`);
          gedcom.push(`1 WIFE ${spouseId}`);
        } else {
          gedcom.push(`1 HUSB ${spouseId}`);
          gedcom.push(`1 WIFE ${indId}`);
        }
        
        // Add marriage information if available
        if (person.extra && (person.extra.married_date || person.extra.married_place)) {
          gedcom.push("1 MARR");
          
          if (person.extra.married_date) {
            gedcom.push(`2 DATE ${formatDate(person.extra.married_date)}`);
          }
          
          if (person.extra.married_place) {
            gedcom.push(`2 PLAC ${person.extra.married_place}`);
          }
        }
        
        // Link children
        if (marriage.children && Array.isArray(marriage.children)) {
          marriage.children.forEach((child) => {
            if (idMap.has(child)) {
              const childId = idMap.get(child);
              gedcom.push(`1 CHIL ${childId}`);
              
              // Add reference to family in child's record
              gedcom.push(`0 ${childId} INDI`);
              gedcom.push(`1 FAMC ${famId}`);
            }
          });
        }
        
        // Add references to family in individual records
        gedcom.push(`0 ${indId} INDI`);
        gedcom.push(`1 FAMS ${famId}`);
        
        gedcom.push(`0 ${spouseId} INDI`);
        gedcom.push(`1 FAMS ${famId}`);
        
        // Process spouse's families recursively
        processFamilyRelationships(marriage.spouse, gedcom, idMap, familyCounter);
      }
    });
  }
}

/**
 * Format a date for GEDCOM format
 */
function formatDate(dateStr) {
  if (!dateStr || dateStr === "unknown") return "";
  
  // This is a simple implementation - you may need to enhance this
  // based on your date formats in the JSON
  return dateStr;
}

/**
 * Format a place as comma-separated jurisdictions from smallest to largest
 */
function formatPlace(city, state, country) {
  const parts = [city, state, country].filter(part => part && part.trim() !== "");
  return parts.join(", ");
}

// Example usage:
// const gedcomOutput = convertJsonToGedcom(yourJsonData);
// console.log(gedcomOutput);

// To test with a sample from the provided JSON:
const sampleJson = [
  {
    "name": "First Last",
    "class": "man",
    "extra":{
      "birthdate":"unknown",
      "birthplace_name":"",
      "birth_address1":"",
      "birth_address2":"",
      "birth_city":"",
      "birth_state_province":"",
      "birth_country":"",
      "married_to":"",
      "married_date":"",
      "married_place":"",
      "married_city":"",
      "married_state":"",
      "deathdate":"unknown",
      "deathplace_name":"",
      "death_address1":"",
      "death_address2":"",
      "death_city":"",
      "death_state_province":"",
      "death_country":"",
      "buried":"",
      "buried_link":"",
      "buried_grave":"",
      "notes":""
   },
    "marriages": [
      {
        "spouse": {
          "name": "First Spouse",
          "class": "woman",
          "extra":{
            "birthdate":"unknown",
            "birthplace_name":"",
            "birth_address1":"",
            "birth_address2":"",
            "birth_city":"",
            "birth_state_province":"",
            "birth_country":"",
            "married_to":"",
            "married_date":"",
            "married_place":"",
            "married_city":"",
            "married_state":"",
            "deathdate":"unknown",
            "deathplace_name":"",
            "death_address1":"",
            "death_address2":"",
            "death_city":"",
            "death_state_province":"",
            "death_country":"",
            "buried":"",
            "buried_link":"",
            "buried_grave":"",
            "notes":""
         }
        },
        "children": [
          {
            "name": "Child from first marriage",
            "class": "man",
            "extra":{
              "birthdate":"unknown",
              "birthplace_name":"",
              "birth_address1":"",
              "birth_address2":"",
              "birth_city":"",
              "birth_state_province":"",
              "birth_country":"",
              "married_to":"",
              "married_date":"",
              "married_place":"",
              "married_city":"",
              "married_state":"",
              "deathdate":"unknown",
              "deathplace_name":"",
              "death_address1":"",
              "death_address2":"",
              "death_city":"",
              "death_state_province":"",
              "death_country":"",
              "buried":"",
              "buried_link":"",
              "buried_grave":"",
              "notes":""
           }
          }
        ]
      }
    ]
  }
];

// Convert the sample to GEDCOM
console.log(convertJsonToGedcom(sampleJson));