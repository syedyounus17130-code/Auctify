 const form = document.getElementById("signupForm");

form.addEventListener("submit", async function(e){

    e.preventDefault();

    const full_name = document.getElementById("name").value;
    const email = document.getElementById("email").value;
    const phone = document.getElementById("phone").value;
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if(password !== confirmPassword){
        alert("Passwords do not match.");
        return;
    }

    const response = await fetch("http://localhost:3000/signup",{

        method:"POST",

        headers:{
            "Content-Type":"application/json"
        },

        body:JSON.stringify({
            full_name,
            email,
            phone,
            password
        })

    });

    const data = await response.json();

    alert(data.message);

    if(data.success){
        window.location.href="login.html";
    }

});