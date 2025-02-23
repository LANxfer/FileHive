let currentSort = {
    column: 'name',
    direction: 'asc'
};

// Pre-shared AES key (matches server’s SECRET_KEY)
const SECRET_KEY_HEX = '546869734973415365637265744b657931323334353637383930313233343536'; // ThisIsASecretKey1234567890123456

document.addEventListener("DOMContentLoaded", function () {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const selectedFileDiv = document.getElementById('selectedFile');
    
    fileInput.addEventListener('change', function(e) {
        handleFileSelect(e.target.files[0]);
    });

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    dropZone.addEventListener('drop', handleDrop, false);

    document.querySelectorAll('th.sortable').forEach(header => {
        header.addEventListener('click', () => {
            const column = header.dataset.sort;
            if (currentSort.column === column) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.column = column;
                currentSort.direction = 'asc';
            }
            document.querySelectorAll('th.sortable').forEach(th => {
                th.classList.remove('asc', 'desc');
            });
            header.classList.add(currentSort.direction);
            fetchFiles();
        });
    });

    fetchFiles();
    fetchIPs(); // Initial fetch only
    // Removed setInterval(fetchIPs, 30000) - refresh is now manual via button
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
            <td>${file.original_name}</td>
            <td>${file.size_fmt}</td>
            <td>${file.modified_fmt}</td>
            <td><button onclick="downloadAndDecrypt('${file.name}', '${file.original_name}')">📥 Download</button></td>
        `;
        tableBody.appendChild(row);
    });
}

function fetchIPs() {
    const recipientSelect = document.getElementById('recipientSelect');
    const currentValue = recipientSelect.value; // Store current selection

    fetch('/get_ips')
        .then(response => response.json())
        .then(ips => {
            // Clear options except "Everyone"
            while (recipientSelect.options.length > 1) {
                recipientSelect.remove(1);
            }
            // Add IPs to dropdown
            ips.forEach(ip => {
                const option = document.createElement('option');
                option.value = ip;
                option.textContent = ip;
                recipientSelect.appendChild(option);
            });
            // Restore the previous selection if it still exists, else default to "Everyone"
            recipientSelect.value = (ips.includes(currentValue) && currentValue !== "Everyone") ? currentValue : "Everyone";
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
        document.getElementById('selectedFile').style.display = 'none';
        fileInput.value = '';
        recipientSelect.value = 'Everyone';
    })
    .catch(error => {
        console.error("Error uploading file:", error);
        alert("Error uploading file: " + error.message);
    });
}

function downloadAndDecrypt(encryptedFilename, originalFilename) {
    fetch(`/download/${encryptedFilename}`)
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch encrypted file');
            return response.arrayBuffer();
        })
        .then(encryptedData => {
            const encryptedBytes = new Uint8Array(encryptedData);
            const iv = encryptedBytes.slice(0, 16);
            const ciphertext = encryptedBytes.slice(16);

            // Decrypt using CryptoJS
            const key = CryptoJS.enc.Hex.parse(SECRET_KEY_HEX);
            const ivWordArray = CryptoJS.lib.WordArray.create(iv);
            const ciphertextWordArray = CryptoJS.lib.WordArray.create(ciphertext);

            const decrypted = CryptoJS.AES.decrypt(
                { ciphertext: ciphertextWordArray },
                key,
                { iv: ivWordArray, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
            );

            // Convert decrypted data to binary
            const decryptedHex = decrypted.toString(CryptoJS.enc.Hex);
            const decryptedBytes = new Uint8Array(decryptedHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

            // Create and download the file
            const blob = new Blob([decryptedBytes], { type: 'application/octet-stream' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = originalFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            console.log(`Decrypted and downloaded ${originalFilename}`);
        })
        .catch(error => {
            console.error("Error decrypting file:", error);
            alert("Failed to decrypt and download file: " + error.message);
        });
}