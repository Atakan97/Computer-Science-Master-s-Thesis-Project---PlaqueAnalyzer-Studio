# MT-Atakan-Celik-Code

## Plaque Calculator App

A web application for displaying relational information content and processing with normalization steps.  
Has been built with JSP/Servlet, Maven and Google App Engine Standard environment.

## Requirements

- ** Java 17+** 
- ** Maven 3.6+**  
- ** Google Cloud SDK** (for App Engine local server and deployment)  
- ** An IDE with Java/JSP support**

## Project Setup

1. **Clone the repository**

   git clone https://git.fim.uni-passau.de/sdbs/theses/students/mt-atakan-celik-code.git
   cd plaque‑calculator‑app

2. **Configure App Engine SDK**

   Cloud SDK settings must be configured for the project.

   gcloud init
   gcloud components install app-engine-java

## Running Project

1. **Building the WAR**

   The following command is used to build the WAR.

   mvn clean package

2. **Running the Dev Server**

   The following command is used to run the dev server.

   mvn appengine:run

3. **Opening the project in the browser**

   In order to use the app, please go to the http://localhost:8080.