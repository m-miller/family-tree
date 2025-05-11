      treeJson = d3.json(thefile, function(error, treeData) {
      	dTree.init(treeData,

					{
						target: "#graph",
						debug: true,
						hideMarriageNodes: true,
						marriageNodeSize: 3,
						height: 800,
						width: 1200,
						callbacks: {
							nodeClick: function(name, extra, id) {
								bdate = bpname = bpadd1 = bpadd2 = bcity = bstate = bcountry = "";
								ddate = dpname = dpadd1 = dpadd2 = dcity = dstate = dcountry = "";
								link = buried = buried_link = buried_grave = "";
								mto = mdate = mdname = mcity = mstate = notes = "";
								if ( extra ) {
									if ( extra.birthdate !== "") bdate = "<br /><span>Born: " + extra.birthdate + "</span>";
									if ( extra.birthplace_name !== "" ) bpname = "<br />At: " + extra.birthplace_name;
									if ( extra.birth_address1 !== "" ) bpadd1 = "<br />" + extra.birth_address1;
									if ( extra.birth_address2 !== "" ) bpadd2 = "<br />" + extra.birth_address2;
									if ( extra.birth_city !== "" ) bcity = "<br />" + extra.birth_city;
									if ( extra.birth_state_province !== "" ) bstate = ", " + extra.birth_state_province;
									if ( extra.birth_country !== "" ) bcountry = "<br />" + extra.birth_country;
									// add marriage date, place
									// add burial place
									if ( extra.married_to !== "" ) mto = "<hr />Married to: " + extra.married_to;
									if ( extra.married_to == null ) mto = "";
									if ( extra.married_date !== "" ) mdate = "<br />on: " + extra.married_date;
									if ( extra.married_date == null ) mdate = "";
									if ( extra.married_place !== "" ) mdname = "<br />at: " + extra.married_place;
									if ( extra.married_place == null ) mdname = "";
									if ( extra.married_city !== "" ) mcity = "<br />" + extra.married_city;
									if ( extra.married_city == null ) mcity = "";
									if ( extra.married_state !== "" ) mstate = ", " + extra.married_state;
									if ( extra.married_state == null ) mstate = "";
									
									if ( extra.link !== "" || extra.link.length > 0 ) { 
										link = "<br /><a href="+extra.link+".html>"+extra.link+" Family Tree</a>";
									}
									if ( extra.link == null ) link = "";
									
									if ( extra.deathdate !== "") ddate = "<span>Died: " + extra.deathdate + "</span>";
									if ( extra.deathplace_name !== "" ) dpname = "<br />At: " + extra.deathplace_name;
									if ( extra.death_address1 !== "" ) dpadd1 = "<br />" + extra.death_address1;
									if ( extra.death_address2 !== "" ) dpadd2 = "<br />" + extra.death_address2;
									if ( extra.death_city !== "" ) dcity = "<br />" + extra.death_city;
									if ( extra.death_state_province !== "" ) dstate = ", " + extra.death_state_province;
									if ( extra.death_country !== "" ) dcountry = "<br />" + extra.death_country;
									
									if ( extra.buried !== "" ) buried = "<br />Buried: " + extra.buried;
									if ( extra.buried == null ) buried = "";
									if ( extra.buried_link !== "" ) buried_link = "<br /><a href="+extra.buried_link+" target='_blank'>Cemetery Map</a>";
									if ( extra.buried_link == null ) buried_link = "";
									if ( extra.buried_grave !== "" ) buried_grave = "<br /><a href="+extra.buried_grave+" target='_blank'>Find a Grave</a>";
									if ( extra.buried_grave == null ) buried_grave = "";
									
									if ( extra.notes !== "" ) notes = "<hr />Notes: " + extra.notes;
									if ( extra.notes == null ) notes = "";
								}
								
				                $("body").on("click", "foreignObject", function(){
									let fostyle = $(this).children('div').attr('class');
									if (fostyle == "man") {
										var bgcolor = "hsl(0, 0%, 63%)";
									} else {
										var bgcolor = "hsl(120, 73%, 55%)"
									}
									console.log(bgcolor)
									if ($('.info').is(":visible")){
										$('.info').html("<div id='close'>&times;</div><span style='font-size: 1rem;'>"+name + "</span>" + bdate + bpname + bpadd1 + bpadd2 + bcity + bstate + bcountry + mto + mdate + mdname + mcity + mstate + link+"<hr />"+ ddate + dpname +dpadd1 + dpadd2 + dcity + dstate + dcountry + buried + buried_link + buried_grave + notes).css({'background-color':bgcolor});
									} else {
										$('#graph').append("<div class='info' style='background-color:"+bgcolor+"'><div id='close'>&times;</div><span style='font-size: 1rem;'>" + name + "</span>" + bdate + bpname + bpadd1 + bpadd2 + bcity + bstate + bcountry + mto + mdate + mdname + mcity + mstate + link+"<hr />"+ ddate + dpname +dpadd1 + dpadd2 + dcity + dstate + dcountry + buried + buried_link + buried_grave + notes + "</div>");
									}
				                });
								
							},
							//nodeRightClick: function(name, extra) {
							//	alert('Right-click: ' + name);
							//},
							textRenderer: function(name, extra, textClass) {
								bdate = "";
								ddate = "";
								if ( extra ) {
								if ( extra.birthdate !== "") bdate = "<br /><span class='halfrem'>Born: " + extra.birthdate + "</span>";
								
								if ( extra.deathdate !== "") ddate = "<br /><span class='halfrem'>Died: " + extra.deathdate + "</span>";
									name = name + bdate + ddate;
								return "<p align='center' class='" + textClass + "'>" + name + "</p>";
								}
							},
							/*
							marriageClick: function(extra, id) {
								alert('Clicked marriage node' + extra.birthplace_name);
							},
							marriageRightClick: function(extra, id) {
								alert('Right-clicked marriage node' + id);
							},
							*/
						}
					});

					function generateSpouseColorCSS() {
						var css = '';
						for (var i = 1; i < 10; i++) {
						  var borderOpacity = 0.3 + (i * 0.1); 
						  css += '.spouse-' + i + ' {\n';
						  css += '  border-left: 5px solid rgba(0, 0, 0, ' + borderOpacity + ');\n';
						  css += '}\n';
						}
						return css;
					  }

					function setupDynamicSpouseColors() {
						var style = document.createElement('style');
						style.type = 'text/css';
						style.innerHTML = generateSpouseColorCSS();
						document.head.appendChild(style);
					  }
					  
					  setupDynamicSpouseColors();
					  
    	});