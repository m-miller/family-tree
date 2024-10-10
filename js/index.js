// Fetch the JSON data from the specified file
d3.json(thefile, function(error, treeData) {
    if (error) {
        console.error('Error loading the JSON data:', error);
        return;
    }

    dTree.init(treeData, {
        target: "#graph",
        debug: true,
        hideMarriageNodes: true,
        marriageNodeSize: 5,
        height: 800,
        width: 1200,
        callbacks: {
            nodeClick: function(name, extra, id) {
                const details = getNodeDetails(extra);
                showNodeInfo(name, details);
            },
            textRenderer: function(name, extra, textClass) {
                return renderText(name, extra, textClass);
            },
            marriageClick: function(extra, id) {
                alert('Clicked marriage node: ' + extra.birthplace_name);
            },
            marriageRightClick: function(extra, id) {
                alert('Right-clicked marriage node: ' + id);
            },
        }
    });
});

// Helper function to extract node details
function getNodeDetails(extra) {
    const details = {
        bdate: "",
        bpname: "",
        bpadd1: "",
        bpadd2: "",
        bcity: "",
        bstate: "",
        bcountry: "",
        mto: "",
        mdate: "",
        mdname: "",
        mcity: "",
        mstate: "",
        ddate: "",
        dpname: "",
        dpadd1: "",
        dpadd2: "",
        dcity: "",
        dstate: "",
        dcountry: "",
        link: "",
        buried: "",
        buried_link: "",
        buried_grave: "",
        notes: ""
    };

    if (extra) {
        details.bdate = extra.birthdate ? `<br /><span>Born: ${extra.birthdate}</span>` : "";
        details.bpname = extra.birthplace_name ? `<br />At: ${extra.birthplace_name}` : "";
        details.bpadd1 = extra.birth_address1 ? `<br />${extra.birth_address1}` : "";
        details.bpadd2 = extra.birth_address2 ? `<br />${extra.birth_address2}` : "";
        details.bcity = extra.birth_city ? `<br />${extra.birth_city}` : "";
        details.bstate = extra.birth_state_province ? `, ${extra.birth_state_province}` : "";
        details.bcountry = extra.birth_country ? `<br />${extra.birth_country}` : "";
        details.mto = extra.married_to ? `<hr />Married to: ${extra.married_to}` : "";
        details.mdate = extra.married_date ? `<br />on: ${extra.married_date}` : "";
        details.mdname = extra.married_place ? `<br />at: ${extra.married_place}` : "";
        details.mcity = extra.married_city ? `<br />${extra.married_city}` : "";
        details.mstate = extra.married_state ? `, ${extra.married_state}` : "";
        details.link = extra.link ? `<br /><a href="${extra.link}.html">${extra.link} Family Tree</a>` : "";
        details.ddate = extra.deathdate ? `<span>Died: ${extra.deathdate}</span>` : "";
        details.dpname = extra.deathplace_name ? `<br />At: ${extra.deathplace_name}` : "";
        details.dpadd1 = extra.death_address1 ? `<br />${extra.death_address1}` : "";
        details.dpadd2 = extra.death_address2 ? `<br />${extra.death_address2}` : "";
        details.dcity = extra.death_city ? `<br />${extra.death_city}` : "";
        details.dstate = extra.death_state_province ? `, ${extra.death_state_province}` : "";
        details.dcountry = extra.death_country ? `<br />${extra.death_country}` : "";
        details.buried = extra.buried ? `<br />Buried: ${extra.buried}` : "";
        details.buried_link = extra.buried_link ? `<br /><a href="${extra.buried_link}" target='_blank'>Cemetery Map</a>` : "";
        details.buried_grave = extra.buried_grave ? `<br /><a href="${extra.buried_grave}" target='_blank'>Find a Grave</a>` : "";
        details.notes = extra.notes ? `<hr />Notes: ${extra.notes}` : "";
    }

    return details;
}

// Helper function to render node info
function showNodeInfo(name, details) {
    const infoHtml = `
        <div class='info'>
            <div id='close'>&times;</div>
            <span style='font-size: 1rem;'>${name}</span>
            ${details.bdate}${details.bpname}${details.bpadd1}${details.bpadd2}${details.bcity}${details.bstate}${details.bcountry}
            ${details.mto}${details.mdate}${details.mdname}${details.mcity}${details.mstate}
            ${details.link}<hr />
            ${details.ddate}${details.dpname}${details.dpadd1}${details.dpadd2}${details.dcity}${details.dstate}${details.dcountry}
            ${details.buried}${details.buried_link}${details.buried_grave}${details.notes}
        </div>
    `;

    $("body").on("click", "foreignObject", function() {
        if ($('.info').is(":visible")) {
            $('.info').html(infoHtml);
        } else {
            $('#graph').append(infoHtml);
        }
    });
}

// Helper function to render text
function renderText(name, extra, textClass) {
    let bdate = extra && extra.birthdate ? `<br /><span class='halfrem'>Born: ${extra.birthdate}</span>` : "";
    let ddate = extra && extra.deathdate ? `<br /><span class='halfrem'>Died: ${extra.deathdate}</span>` : "";
    name = `${name}${bdate}${ddate}`;
    return `<p align='center' class='${textClass}'>${name}</p>`;
}
