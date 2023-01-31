var request = new XMLHttpRequest();
request.open("GET", "data.json", false);
request.send(null);
const jsonarray = JSON.parse(request.responseText);

// compare birthdate and deathdate, get ages

var bdays = iterateObject(jsonarray, 'birthdate');

var ddays = iterateObject(jsonarray, 'deathdate');

function calcDate(date1, date2){
    const dt_date1 = new Date(date1);
    const dt_date2 = new Date(date2);

    //Get the Timestamp
    const date1_time_stamp = dt_date1.getTime();
    const date2_time_stamp = dt_date2.getTime();

    let calc;

    //Check which timestamp is greater
    if (date1_time_stamp > date2_time_stamp) {
        calc = new Date(date1_time_stamp - date2_time_stamp);
    } else {
        calc = new Date(date2_time_stamp - date1_time_stamp);
    }
    //Retrieve the date, month and year
    const calcFormatTmp = calc.getDate() + '-' + (calc.getMonth() + 1) + '-' + calc.getFullYear();
    const calcFormat = calcFormatTmp.split("-");
    const years_passed = Number(Math.abs(calcFormat[2]) - 1970);

	var ages = [];
	ages.push(years_passed);
	return ages;
}

var ages =[];
const countpersons = bdays.length;
for ( p = 0; p < countpersons; p++ ) {
	age = calcDate(bdays[p], ddays[p]);
	if (!isNaN(age) ){
		ages[p] = age;
	}
}

function iterateObject(obj, property, output=[]) {
  if (!output) {
    output = [];
  }
   for(prop in obj) {
  	if(typeof(obj[prop]) == "object"){
    	iterateObject(obj[prop], arguments[1], output);
    } else {
    	if (prop == arguments[1]) {
        output.push(obj[arguments[1]]);
      }
    }
  }
  return output;
}

var named = iterateObject(jsonarray, 'name');
//console.log(named);

const marriedmonths = iterateObject(jsonarray, 'married_date');
//console.log(marriedmonths);

var names = [];
// get first names into array
for ( s=0; s < named.length; s++ ) {
	var words = named[s].split(' ');
		names[s] = words[0];
} 
 
  function converttoArray ( obj ) {
	   var result = [];
	   for(var i in obj){
		   result.push([i, obj[i]]);
	   }
  return result;
}

const count = res =>
  res.reduce((result, value) => ({ ...result,
    [value]: (result[value] || 0) + 1
  }), {});

const namesarray = converttoArray(count(names));

  function sortFunction(a, b) {
      if (a[1] === b[1]) {
          return 0;
      }
      else {
          return (a[1] < b[1]) ? 1 : -1;
      }
  }


var months=[];
// get three-letter months into array
function retmonths(obj) {
for ( s=0; s < obj.length; s++ ) {
	var words = obj[s].split(' ');
	var lengths = words.map(function(word){
	 return word.length
	})
	if (lengths[1] == 3 ) {
		months[s] = words[1];
	}
}
return months;
}
 
  const married = converttoArray(count(retmonths(marriedmonths))).sort(sortFunction);

  const sortedages = converttoArray(count(ages)).sort(sortFunction);

  const sortedbdays = converttoArray(count(retmonths(bdays))).sort(sortFunction);
 
  const sortedddays = converttoArray(count(retmonths(ddays))).sort(sortFunction);
  
  const sortednames = namesarray.sort(sortFunction);

  function addRow(names, freq, div ) {
    var tableBody = document.getElementById(div);
    var newRow = tableBody.insertRow(tableBody.rows.length);
    var nameCell = newRow.insertCell(0);
    var freqCell = newRow.insertCell(1);
    var nameText = document.createTextNode(names);
    var freqText = document.createTextNode(freq);
    nameCell.appendChild(nameText);
    freqCell.appendChild(freqText);
  }
  

var total = 0;
for(var i = 0; i < sortedages.length; i++) {
    total += parseInt(sortedages[i][0]);
}
var avg = Math.round(total / sortedages.length);
 
  
  $(document).ready(function() {
		sortedbdays.forEach(function(listItem){
			addRow(listItem[0], listItem[1], 'bdaysbody');
		});
		
		sortedddays.forEach(function(listItem){
			addRow(listItem[0], listItem[1], 'ddaysbody');
		});

		sortednames.forEach(function(listItem){
			addRow(listItem[0], listItem[1], 'namesbody');
		});
		
		sortedages.forEach(function(listItem){
			addRow(listItem[0], listItem[1], 'agesbody');
		});
		addRow('Average', avg, 'agesbody');
		
  
function makeCSV(file, len, header) {
  var csvContent = [];
  if (header.length > 0 ){
    csvContent = header;
  } 
file.slice(0,len).forEach(function(rowArray) {
    let row = rowArray[0] + ","+rowArray[1];
    csvContent += row + "\r\n";
});
return csvContent;
}

namescsv = makeCSV( sortednames, 20, ['name', 'count'+'\r\n'] );

agescsv = makeCSV( sortedages, 20, ['age','count' + '\r\n']);

marriedcsv = makeCSV( married, 12, ['month', 'count' + '\r\n']);

//  graphs function 

function barchart(csvdata, divid, var1, var2, color) {
 // set the dimensions and margins of the graph
var margin = {top: 30, right: 30, bottom: 70, left: 20},
    width = 500,
    height = 400 - margin.top - margin.bottom;

data = d3.csvParse(csvdata);
//console.log(data);
// append the svg object to the body of the page
var svg = d3.select(divid)
  .append("svg")
  .attr("width", width + margin.left + margin.right)
  .attr("height", height + margin.top + margin.bottom)
  .append("g")
  .attr("transform",
        "translate(" + margin.left + "," + margin.top + ")");

  // X axis
  var ex = arguments[2];
  var why = arguments[3];

  var x = d3.scaleBand()
    .range([ 0, width ])
    .domain(data.map(function(d) { return d[ex]; }))
    .padding(0.2);
  svg.append("g")
    .attr("transform", "translate(0," + height + ")")
    .call(d3.axisBottom(x))
    .selectAll("text")
    .attr("transform", "translate(-10,0)rotate(-45)")
    .style("text-anchor", "end");
	  
  // Add Y axis
  var y = d3.scaleLinear()
	  .domain([0, data[0][why]])
    .range([ height, 0]);
  svg.append("g")
    .call(d3.axisLeft(y));

  // Bars
  svg.selectAll("mybar")
    .data(data)
    .enter()
    .append("rect")
    .attr("x", function(d) { return x(d[ex]); })
    .attr("y", function(d) { return y(d[why]); })
    .attr("width", x.bandwidth())
    .attr("height", function(d) { return height - y(d[why]); })
    .attr("fill", color)
}

barchart(namescsv, '#namesgraph', 'name', 'count', '#045FB4');

barchart(agescsv, '#agesgraph', 'age', 'count', '#0B2161');

barchart(marriedcsv, '#married', 'month', 'count', '#29088A');


	}) // document.ready

	
	$(function() {
	  $("#birthdays, #deaths, #nameslist, #age").tablesorter(({"theme": "default"}));
	});
