//const API_URL = "http://localhost:7860/api";
const API_URL = "https://ismizo-cvbora.hf.space/api"; 
const token = localStorage.getItem('cv_token');



if (!token) {
    window.location.href = 'index.html';
}

// 1. Fetch User Profile & Credits
async function loadProfile() {
    try {
        const res = await fetch(`${API_URL}/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const user = await res.json();
        
        const freeLeft = 1 - user.freeGenerationsUsed;
        const paid = user.paidCredits;
        
        document.getElementById('creditsDisplay').innerText = 
            `Free: ${freeLeft} | Paid: ${paid}`;
    } catch (err) {
        console.error("Auth Error", err);
        logout();
    }
}

// 2. Upload Resume Logic
async function uploadResume() {
    const fileInput = document.getElementById('resumeFile');
    if (!fileInput.files[0]) return alert("Select a file first!");

    const formData = new FormData();
    formData.append('resume', fileInput.files[0]);

    const btn = document.querySelector('button[onclick="uploadResume()"]');
    btn.innerText = "Extracting...";
    
    try {
        const res = await fetch(`${API_URL}/extract-resume`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const data = await res.json();
        
        if (data.success) {
            document.getElementById('resumeText').value = data.extractedText;
        } else {
            alert("Error: " + data.error);
        }
    } catch (e) {
        alert("Upload Failed");
    } finally {
        btn.innerText = "Extract Text";
    }
}

// 3. Generate CV Logic
let generatedJsonData = null; // Store data globally to use in download
let currentTab = 'upload'; // Default tab

// 1. Tab Switching Logic
function switchTab(tabName) {
    currentTab = tabName;
    
    // Reset Buttons
    ['upload', 'links', 'builder'].forEach(t => {
        const btn = document.getElementById(`tab-${t}`);
        const content = document.getElementById(`content-${t}`);
        
        if (t === tabName) {
            btn.classList.remove('bg-gray-700', 'text-gray-300');
            btn.classList.add('bg-blue-600', 'text-white');
            content.classList.remove('hidden');
        } else {
            btn.classList.add('bg-gray-700', 'text-gray-300');
            btn.classList.remove('bg-blue-600', 'text-white');
            content.classList.add('hidden');
        }
    });
}

// 2. Helper: Compile Builder Data to Text
function getBuilderText() {
    const name = document.getElementById('buildName').value;
    const role = document.getElementById('buildRole').value;
    const exp = document.getElementById('buildExp').value;
    const edu = document.getElementById('buildEdu').value;
    const skills = document.getElementById('buildSkills').value;
    
    if(!name && !role && !exp) return "";

    return `
    NAME: ${name}
    CURRENT ROLE: ${role}
    EXPERIENCE: ${exp}
    EDUCATION: ${edu}
    SKILLS: ${skills}
    `;
}

// 3. Generate Function (Updated)
async function generateCV() {
    const btn = document.getElementById('generateBtn');
    
    // Gather Data based on active tab
    const formData = new FormData();
    
    // Add Job Description
    const jobText = document.getElementById('jobDesc').value;
    const jobFiles = document.getElementById('jobDescFiles').files;
    
    if (!jobText && jobFiles.length === 0) return alert("Please provide a Job Description.");
    
    formData.append('jobDescText', jobText);
    formData.append('instructions', document.getElementById('instructions').value);
    for (let f of jobFiles) formData.append('jobDescImages', f);

    // Add Resume Source
    let hasSource = false;

    if (currentTab === 'upload') {
        const file = document.getElementById('resumeFile').files[0];
        if (file) {
            formData.append('resumeFiles', file);
            hasSource = true;
        }
    } else if (currentTab === 'links') {
        const txt = document.getElementById('rawText').value;
        const li = document.getElementById('linkedin').value;
        const gh = document.getElementById('github').value;
        
        if (txt || li || gh) {
            formData.append('resumeText', txt);
            formData.append('linkedInUrl', li);
            formData.append('githubUrl', gh);
            hasSource = true;
        }
    } else if (currentTab === 'builder') {
        const builderText = getBuilderText();
        if (builderText.trim().length > 10) {
            formData.append('resumeText', builderText); // Send as text
            hasSource = true;
        }
    }

    if (!hasSource) return alert("Please provide candidate data (File, Links, or Builder).");

    // UI Loading State
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Processing...';
    btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/generate-cv`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        
        const data = await res.json();

        if (res.status === 402) {
            document.getElementById('paymentModal').classList.remove('hidden');
            return;
        }
        
        if (data.success) {
            generatedJsonData = data.data;
            renderHTMLPreview(data.data);
            document.getElementById('placeholder').classList.add('hidden');
            document.getElementById('resultContainer').classList.remove('hidden');
            loadProfile(); // Refresh credits
        } else {
            alert(data.error || "Generation failed.");
        }

    } catch (e) {
        console.error(e);
        alert("Server Error");
    } finally {
        btn.innerHTML = '<i class="fas fa-magic mr-2"></i> Generate Professional CV';
        btn.disabled = false;
    }
}

// Render the HTML Preview

/*

function renderHTMLPreview(data) {
    const div = document.getElementById('previewArea');
    let html = `
        <h1 class="text-3xl font-bold text-gray-800 border-b-2 border-gray-800 pb-2 mb-4 uppercase">${data.personal_info.name}</h1>
        <p class="text-sm text-center mb-6">
            ${data.personal_info.email} | ${data.personal_info.phone} | ${data.personal_info.location} <br>
            <a href="${data.personal_info.linkedin}" class="text-blue-600">LinkedIn Profile</a>
        </p>

        <h2 class="text-lg font-bold uppercase border-b border-gray-300 mb-2 mt-4">Professional Summary</h2>
        <p class="text-sm mb-4">${data.summary}</p>

        <h2 class="text-lg font-bold uppercase border-b border-gray-300 mb-2 mt-4">Skills</h2>
        <div class="flex flex-wrap gap-2 mb-4">
            ${data.skills.map(s => `<span class="bg-gray-100 px-2 py-1 text-xs rounded">${s}</span>`).join('')}
        </div>

        <h2 class="text-lg font-bold uppercase border-b border-gray-300 mb-2 mt-4">Experience</h2>
    `;

    data.experience.forEach(job => {
        html += `
            <div class="mb-4">
                <div class="flex justify-between font-bold text-sm">
                    <span>${job.role} - ${job.company}</span>
                    <span>${job.dates}</span>
                </div>
                <ul class="list-disc list-outside ml-4 text-sm mt-1">
                    ${job.points.map(p => `<li>${p}</li>`).join('')}
                </ul>
            </div>
        `;
    });

    html += `<h2 class="text-lg font-bold uppercase border-b border-gray-300 mb-2 mt-4">Education</h2>`;
    data.education.forEach(edu => {
        html += `
            <div class="flex justify-between text-sm mb-1">
                <span class="font-bold">${edu.degree}, ${edu.school}</span>
                <span>${edu.dates}</span>
            </div>
        `;
    });
    
    // Append Cover Letter
    html += `<br><hr class="my-8 border-dashed border-gray-400"><br>`;
    html += `<h2 class="text-lg font-bold uppercase mb-4">Cover Letter</h2>`;
    html += `<div class="whitespace-pre-wrap text-sm">${data.cover_letter}</div>`;

    div.innerHTML = html;
} 

*/

function renderHTMLPreview(data) {
    const div = document.getElementById('previewArea');
    const cl = data.cover_letter;

    let html = `
        <h1 class="text-3xl font-bold text-gray-800 border-b-2 border-gray-800 pb-2 mb-4 uppercase">${data.personal_info.name}</h1>
        <p class="text-sm text-center mb-6">
            ${data.personal_info.email} | ${data.personal_info.phone} | ${data.personal_info.location} <br>
            <a href="${'https://'+data.personal_info.linkedin}" class="text-blue-600">LinkedIn Profile</a>
        </p>

        <h2 class="text-lg font-bold uppercase border-b border-gray-300 mb-2 mt-4">Professional Summary</h2>
        <p class="text-sm mb-4">${data.summary}</p>

        <h2 class="text-lg font-bold uppercase border-b border-gray-300 mb-2 mt-4">Skills</h2>
        <div class="flex flex-wrap gap-2 mb-4">
            ${data.skills.map(s => `<span class="bg-gray-100 px-2 py-1 text-xs rounded">${s}</span>`).join('')}
        </div>

        <h2 class="text-lg font-bold uppercase border-b border-gray-300 mb-2 mt-4">Experience</h2>
    `;

    data.experience.forEach(job => {
        html += `
            <div class="mb-4">
                <div class="flex justify-between font-bold text-sm">
                    <span>${job.role} - ${job.company}</span>
                    <span>${job.dates}</span>
                </div>
                <ul class="list-disc list-outside ml-4 text-sm mt-1">
                    ${job.points.map(p => `<li>${p}</li>`).join('')}
                </ul>
            </div>
        `;
    });

    html += `<h2 class="text-lg font-bold uppercase border-b border-gray-300 mb-2 mt-4">Education</h2>`;
    data.education.forEach(edu => {
        html += `
            <div class="flex justify-between text-sm mb-1">
                <span class="font-bold">${edu.degree}, ${edu.school}</span>
                <span>${edu.dates}</span>
            </div>
        `;
    });
    
    // Better Formatted Cover Letter Section
    html += `
        <br><hr class="my-8 border-dashed border-gray-400"><br>
        <div class="p-8 bg-white shadow-sm border border-gray-100 text-sm leading-relaxed text-gray-800">
            <div class="mb-6">
                <p><strong>${cl.applicant_full_name}</strong></p>
                <p>${cl.applicant_email} | ${cl.applicant_phone}</p>
                <p>${cl.today_date}</p>
            </div>
            <div class="mb-6">
                <p><strong>To: ${cl.job_poster_full_name}</strong></p>
                <p>${cl.job_poster_position} at ${cl.job_poster_company}</p>
            </div>
            <p class="font-bold mb-4">${cl.letter_title}</p>
            <p class="mb-4">${cl.greeting}</p>
            <div class="whitespace-pre-wrap mb-6">${cl.body}</div>
            <p>${cl.closing}</p>
        </div>
    `;

    div.innerHTML = html;
}


/*
function downloadWord() {
    if (!generatedJsonData) return alert("No CV generated yet.");
    
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;
    const data = generatedJsonData;

    // Helper for Experience Section
    const experienceParagraphs = [];
    data.experience.forEach(job => {
        experienceParagraphs.push(
            new Paragraph({
                children: [
                    new TextRun({ text: job.role, bold: true, size: 24 }),
                    new TextRun({ text: ` at ${job.company}`, bold: true, size: 24 }),
                    new TextRun({ text: `   ${job.dates}`, italics: true, size: 20 }),
                ],
                spacing: { before: 200 },
            })
        );
        job.points.forEach(point => {
            experienceParagraphs.push(
                new Paragraph({
                    text: point,
                    bullet: { level: 0 },
                })
            );
        });
    });

    const doc = new Document({
        sections: [{
            properties: {},
            children: [
                // Name
                new Paragraph({
                    text: data.personal_info.name,
                    heading: HeadingLevel.TITLE,
                    alignment: AlignmentType.CENTER,
                }),
                // Contact
                new Paragraph({
                    text: `${data.personal_info.email} | ${data.personal_info.phone} | ${data.personal_info.location}`,
                    alignment: AlignmentType.CENTER,
                }),
                new Paragraph({ text: "" }), // Spacing

                // Summary
                new Paragraph({ text: "PROFESSIONAL SUMMARY", heading: HeadingLevel.HEADING_2 }),
                new Paragraph({ text: data.summary }),

                // Skills
                new Paragraph({ text: "SKILLS", heading: HeadingLevel.HEADING_2 }),
                new Paragraph({ text: data.skills.join(", ") }),

                // Experience
                new Paragraph({ text: "EXPERIENCE", heading: HeadingLevel.HEADING_2 }),
                ...experienceParagraphs,

                // Education
                new Paragraph({ text: "EDUCATION", heading: HeadingLevel.HEADING_2 }),
                ...data.education.map(edu => new Paragraph({
                    text: `${edu.degree}, ${edu.school} (${edu.dates})`,
                    bullet: { level: 0 }
                })),
                
                // Page Break for Cover Letter
                new Paragraph({ pageBreakBefore: true, text: "COVER LETTER", heading: HeadingLevel.HEADING_1 }),
                new Paragraph({ text: data.cover_letter })
            ],
        }],
    });

    Packer.toBlob(doc).then(blob => {
        saveAs(blob, `${data.personal_info.name.replace(" ", "_")}_CV.docx`);
    });
}

*/
// Function 1: Download CV ONLY
async function downloadCV() {
    if (!generatedJsonData) return alert("No CV generated yet.");
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;
    const data = generatedJsonData;

    const experienceParagraphs = [];
    data.experience.forEach(job => {
        experienceParagraphs.push(new Paragraph({
            children: [
                new TextRun({ text: job.role, bold: true, size: 24 }),
                new TextRun({ text: ` at ${job.company}`, bold: true, size: 24 }),
                new TextRun({ text: `   ${job.dates}`, italics: true, size: 20 }),
            ],
            spacing: { before: 200 },
        }));
        job.points.forEach(p => experienceParagraphs.push(new Paragraph({ text: p, bullet: { level: 0 } })));
    });

    const doc = new Document({
        sections: [{
            children: [
                new Paragraph({ text: data.personal_info.name, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
                new Paragraph({ text: `${data.personal_info.email} | ${data.personal_info.phone}`, alignment: AlignmentType.CENTER }),
                new Paragraph({ text: "PROFESSIONAL SUMMARY", heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }),
                new Paragraph({ text: data.summary }),
                new Paragraph({ text: "SKILLS", heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }),
                new Paragraph({ text: data.skills.join(", ") }),
                new Paragraph({ text: "EXPERIENCE", heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }),
                ...experienceParagraphs,
                new Paragraph({ text: "EDUCATION", heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }),
                ...data.education.map(edu => new Paragraph({ text: `${edu.degree}, ${edu.school} (${edu.dates})`, bullet: { level: 0 } }))
            ],
        }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${data.personal_info.name.replace(/\s/g, "_")}_CV.docx`);
}

// Function 2: Download Cover Letter ONLY
async function downloadCoverLetter() {
    if (!generatedJsonData) return alert("No CV generated yet.");
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;
    const cl = generatedJsonData.cover_letter;

    const doc = new Document({
        sections: [{
            children: [
                new Paragraph({ children: [new TextRun({ text: cl.applicant_full_name, bold: true, size: 28 })] }),
                new Paragraph({ text: cl.applicant_email }),
                new Paragraph({ text: cl.applicant_phone, spacing: { after: 400 } }),
                
                new Paragraph({ text: cl.today_date, spacing: { after: 400 } }),

                new Paragraph({ children: [new TextRun({ text: `To: ${cl.job_poster_full_name}`, bold: true })] }),
                new Paragraph({ text: `${cl.job_poster_position}` }),
                new Paragraph({ text: `${cl.job_poster_company}`, spacing: { after: 400 } }),

                new Paragraph({ children: [new TextRun({ text: cl.letter_title, bold: true, underline: {} })], spacing: { after: 400 } }),
                
                new Paragraph({ text: cl.greeting, spacing: { after: 200 } }),
                
                // Splitting body by double newlines to create proper Word paragraphs
                ...cl.body.split('\n\n').map(para => new Paragraph({ text: para, spacing: { after: 200 } })),

                new Paragraph({ text: cl.closing, spacing: { before: 400 } }),
            ],
        }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${cl.applicant_full_name.replace(/\s/g, "_")}_Cover_Letter.docx`);
}


// Assumes 'cvData' is the JSON object you got from the /api/generate-cv endpoint
const downloadPdf = async (type = 'cv') => {
  const response = await fetch(`${API_URL}/download-pdf`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}` 
    },
    body: JSON.stringify({
      type: type, // or 'cover_letter'
      data: generatedJsonData 
    })
  });

  if (response.ok) {
    // Convert response to blob and trigger download
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const filename = type === 'cv' ? `${generatedJsonData.personal_info.name.replace(/\s/g, "_")}_CV.pdf` : `${generatedJsonData.cover_letter.applicant_full_name.replace(/\s/g, "_")}_Cover_Letter.pdf`;
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
};




// 4. Payment Logic
async function pay() {
    const phone = document.getElementById('payPhone').value;
    if (!phone) return alert("Enter phone number");

    try {
        //  /dev/add-credits
        // /pay
        const res = await fetch(`${API_URL}/pay`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ phoneNumber: phone, amount: 1000 })
        });
        const data = await res.json();
        alert(data.message);
        closeModal();
    } catch (e) {
        alert("Payment Failed");
    }
}

function closeModal() {
    document.getElementById('paymentModal').classList.add('hidden');
}

function logout() {
    localStorage.removeItem('cv_token');
    window.location.href = 'index.html';
}

function printCV() {
    const printContent = document.getElementById('cvContent').innerHTML;
    const originalContent = document.body.innerHTML;
    document.body.innerHTML = printContent;
    window.print();
    document.body.innerHTML = originalContent;
    window.location.reload(); // Reload to restore event listeners
}


function updateFileName(input) {
    const display = document.getElementById('fileNameDisplay');
    if(input.files && input.files[0]) {
        display.innerText = input.files[0].name;
        display.classList.add('text-blue-400');
    }
}


// Initialize
loadProfile();
