// Global variables for sorting
let currentSort = {
    column: 'name',
    direction: 'asc'
};

document.addEventListener("DOMContentLoaded", function () {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const selectedFileDiv = document.getElementById('selectedFile');
    
    // File input change handler
    fileInput.addEventListener('change', function(e) {
        handleFileSelect(e.target.files[0]);
    });

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    // Highlight drop zone when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    // Handle dropped files
    dropZone.addEventListener('drop', handleDrop, false);

    // Add click handlers for sortable headers
    document.querySelectorAll('th.sortable').forEach(header => {
        header.addEventListener('click', () => {
            const column = header.dataset.sort;
            
            // Update sort direction
            if (currentSort.column === column) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.column = column;
                currentSort.direction = 'asc';
            }
            
            // Update header classes
            document.querySelectorAll('th.sortable').forEach(th => {
                th.classList.remove('asc', 'desc');
            });
            header.classList.add(currentSort.direction);

            // Fetch files with new sort parameters
            fetchFiles();
        });
    });

    // Initial fetches
    fetchFiles();
    fetchIPs();
    // Refresh IPs every 10 seconds
    setInterval(fetchIPs, 10000);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function highlight(e) {
    document.getElementById('dropZone').classList.add('drag-over');
}

function unhighlight(e) {
    document.getElementById('dropZone').classList.remove('drag-over');
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const file = dt.files[0];
    handleFileSelect(file);
}

function handleFileSelect(file) {
    if (file) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        const fileInput = document.getElementById('fileInput');
        fileInput.files = dataTransfer.files;
        
        const selectedFileDiv = document.getElementById('selectedFile');
        selectedFileDiv.style.display = 'block';
        selectedFileDiv.textContent = `Selected: ${file.name}`;
    }
}

function fetchFiles() {
    const queryParams = new URLSearchParams({
        sort: currentSort.column,
        order: currentSort.direction
    });

    fetch(`/get_files?${queryParams}`)
        .then(response => response.json())
        .then(files => {
            populateFileTable(files);
        })
        .catch(error => {
            console.error("Error fetching files:", error);
            const tableBody = document.querySelector("#fileTable tbody");
            tableBody.innerHTML = `<tr><td colspan="5">Error loading files: ${error.message}</td></tr>`;
        });
}

function populateFileTable(files) {
    const tableBody = document.querySelector("#fileTable tbody");
    tableBody.innerHTML = "";

    if (!Array.isArray(files) || files.length === 0) {
        tableBody.innerHTML = "<tr><td colspan='5'>No files found</td></tr>";
        return;
    }

    files.forEach((file, index) => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${file.name}</td>
            <td>${file.size_fmt}</td>
            <td>${file.modified_fmt}</td>
            <td><a href="/download/${file.name}" download>📥 Download</a></td>
        `;
        tableBody.appendChild(row);
    });
}

function fetchIPs() {
    fetch('/get_ips')
        .then(response => response.json())
        .then(ips => {
            const recipientSelect = document.getElementById('recipientSelect');
            // Clear existing IPs except "Everyone"
            while (recipientSelect.options.length > 1) {
                recipientSelect.remove(1);
            }
            ips.forEach(ip => {
                const option = document.createElement('option');
                option.value = ip;
                option.textContent = ip;
                recipientSelect.appendChild(option);
            });
        })
        .catch(error => {
            console.error("Error fetching IPs:", error);
        });
}

function uploadFile() {
    const fileInput = document.getElementById("fileInput");
    const recipientSelect = document.getElementById("recipientSelect");
    const file = fileInput.files[0];
    const recipient = recipientSelect.value;

    if (!file) {
        alert("Please select a file first.");
        return;
    }

    const formData = new FormData();
    formData.append("file", file);
    if (recipient && recipient !== "Everyone") {
        formData.append("recipient", recipient);
    } else {
        formData.append("recipient", "Everyone");
    }

    fetch("/upload", {
        method: "POST",
        body: formData
    })
    .then(response => response.json())
    .then(result => {
        if (result.error) {
            throw new Error(result.error);
        }
        alert(result.message || "File uploaded successfully!");
        fetchFiles();
        // Reset the upload interface
        document.getElementById('selectedFile').style.display = 'none';
        fileInput.value = '';
        recipientSelect.value = 'Everyone';
    })
    .catch(error => {
        console.error("Error uploading file:", error);
        alert("Error uploading file: " + error.message);
    });
}