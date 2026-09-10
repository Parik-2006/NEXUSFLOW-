/**
 * server/routes/ai.js
 * NEXUSFLOW 3.0 — AI quiz generation + submission ($0 OmniRoute only).
 *
 * FIX 5 (Combined Fixes 1–5):
 *  - Each quiz contains EXACTLY 5 MCQ questions.
 *  - Each question has EXACTLY 4 options, exactly 1 correct answer,
 *    and an explanation.
 *  - AI generation is OPTIONAL and validates its output before trusting it.
 *  - On any AI failure (or invalid output) we fall back to a deterministic
 *    5-question bank per skill — never blocks the user.
 *  - Verification threshold is 3 / 5 correct (NOT 80% of score).
 */
import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../auth.js";
import { resolveAuthUser } from "./teams.js";

const router = Router();

// ── Deterministic 5-question bank per skill ─────────────────────────────────
// Each entry MUST have exactly 5 questions. Each question MUST have exactly
// 4 options, exactly 1 correctIndex, and an explanation.
const QUESTION_BANK = {
  JavaScript: [
    { question: "What does Array.prototype.map() return?",
      options: ["The original array", "A new array", "A boolean", "A single value"],
      correctIndex: 1,
      explanation: "map() always returns a new array of the same length as the source." },
    { question: "Which keyword declares a block-scoped variable that can be reassigned?",
      options: ["const", "let", "var", "static"],
      correctIndex: 1,
      explanation: "`let` is block-scoped and reassignable; `const` is block-scoped but immutable." },
    { question: "What is the output of: typeof null?",
      options: ["\"null\"", "\"object\"", "\"undefined\"", "\"boolean\""],
      correctIndex: 1,
      explanation: "This is a long-standing quirk in JavaScript — `typeof null === \"object\"`." },
    { question: "Which method removes the last element from an array?",
      options: ["shift()", "slice()", "splice()", "pop()"],
      correctIndex: 3,
      explanation: "`pop()` removes and returns the last element; `shift()` removes the first." },
    { question: "Which symbol is used to define a template literal?",
      options: ["Single quotes ''", "Double quotes \"\"", "Backticks ``", "Square brackets []"],
      correctIndex: 2,
      explanation: "Template literals use backticks and support interpolation via ${}." },
  ],
  TypeScript: [
    { question: "Which TypeScript syntax defines a string union?",
      options: ["string", "String", "\"a\" | \"b\"", "Union<string, string>"],
      correctIndex: 2,
      explanation: "Union types use the pipe operator: type T = \"a\" | \"b\"." },
    { question: "What does the `readonly` modifier do?",
      options: ["Makes a property optional", "Prevents reassignment after init", "Hides the property at runtime", "Converts to const"],
      correctIndex: 1,
      explanation: "`readonly` prevents writes to a property after it's set." },
    { question: "Which file extension is standard for TypeScript source?",
      options: [".js", ".ts", ".tsx only", ".d.ts"],
      correctIndex: 1,
      explanation: ".ts is the standard extension; .tsx adds JSX support." },
    { question: "How do you declare an array of numbers?",
      options: ["number[]", "Array<number>", "Both number[] and Array<number>", "list<number>"],
      correctIndex: 2,
      explanation: "Both syntaxes are valid and equivalent in TypeScript." },
    { question: "What does `unknown` differ from `any` in?",
      options: ["Nothing — they are identical", "unknown requires a type check before use", "any is stricter", "unknown cannot store values"],
      correctIndex: 1,
      explanation: "`unknown` is the type-safe counterpart of `any` — you must narrow it before use." },
  ],
  Python: [
    { question: "Which keyword defines a function in Python?",
      options: ["function", "def", "func", "define"],
      correctIndex: 1,
      explanation: "Python uses `def` to start a function definition." },
    { question: "Which data type is immutable in Python?",
      options: ["list", "dict", "tuple", "set"],
      correctIndex: 2,
      explanation: "Tuples are immutable sequences." },
    { question: "What is the correct file extension for Python files?",
      options: [".py", ".pt", ".pyt", ".python"],
      correctIndex: 0,
      explanation: ".py is the standard Python source extension." },
    { question: "Which operator performs floor division?",
      options: ["/", "//", "%", "**"],
      correctIndex: 1,
      explanation: "`//` is floor division — divides and rounds toward negative infinity." },
    { question: "How do you start a single-line comment in Python?",
      options: ["//", "#", "/*", "--"],
      correctIndex: 1,
      explanation: "Python uses the hash character # for comments." },
  ],
  Java: [
    { question: "What is the entry point of a Java program?",
      options: ["start()", "main()", "run()", "init()"],
      correctIndex: 1,
      explanation: "public static void main(String[] args) is the standard entry point." },
    { question: "Which keyword is used for inheritance in Java?",
      options: ["inherits", "extends", "implements", "super"],
      correctIndex: 1,
      explanation: "Classes use `extends`; interfaces use `implements`." },
    { question: "What does JVM stand for?",
      options: ["Java Variable Machine", "Java Virtual Machine", "Joint Variable Method", "Java Visual Manager"],
      correctIndex: 1,
      explanation: "JVM = Java Virtual Machine — the runtime that executes bytecode." },
    { question: "Which access modifier makes a member visible everywhere?",
      options: ["private", "protected", "package", "public"],
      correctIndex: 3,
      explanation: "`public` removes all access restrictions." },
    { question: "Which collection is ordered and allows duplicates?",
      options: ["Set", "Map", "List", "Queue"],
      correctIndex: 2,
      explanation: "List preserves insertion order and allows duplicate elements." },
  ],
  React: [
    { question: "Which hook is used for side effects in React?",
      options: ["useState", "useEffect", "useMemo", "useRef"],
      correctIndex: 1,
      explanation: "useEffect runs side effects after render." },
    { question: "How do you pass data from parent to child?",
      options: ["state", "props", "context", "refs"],
      correctIndex: 1,
      explanation: "Props are the canonical parent-to-child data channel." },
    { question: "What is JSX?",
      options: ["A different language", "A syntax extension to JavaScript", "A CSS framework", "A database query language"],
      correctIndex: 1,
      explanation: "JSX is a syntax extension that lets you write HTML-like code inside JavaScript." },
    { question: "What does `useState` return?",
      options: ["A single value", "A pair: current state + setter", "An object", "A promise"],
      correctIndex: 1,
      explanation: "useState returns [value, setValue]." },
    { question: "Which method renders a React component to the DOM?",
      options: ["React.mount()", "ReactDOM.render()", "React.show()", "ReactDOM.createRoot()"],
      correctIndex: 3,
      explanation: "React 18 uses ReactDOM.createRoot().render() to mount a component." },
  ],
  Angular: [
    { question: "Which decorator marks a class as an Angular component?",
      options: ["@Directive", "@Component", "@Injectable", "@NgModule"],
      correctIndex: 1,
      explanation: "@Component is required on a component class." },
    { question: "Which file ends in .spec.ts used for?",
      options: ["Routing config", "Component template", "Unit tests", "Styles"],
      correctIndex: 2,
      explanation: ".spec.ts files contain unit tests, typically run by Karma/Jasmine." },
    { question: "Which CLI command creates a new Angular component?",
      options: ["ng new component", "ng generate component", "ng add component", "ng make component"],
      correctIndex: 1,
      explanation: "ng generate component <name> (alias: ng g c <name>)." },
    { question: "Which binding sends data from component to template?",
      options: ["Event binding ()", "Property binding []", "Two-way [(ngModel)]", "String interpolation {{}}"],
      correctIndex: 3,
      explanation: "String interpolation {{ value }} displays component data in the template." },
    { question: "What is a service in Angular primarily used for?",
      options: ["Rendering templates", "Sharing logic and data", "Defining routes", "Styling components"],
      correctIndex: 1,
      explanation: "Services centralise business logic and data — usually provided via DI." },
  ],
  Vue: [
    { question: "Which Vue directive conditionally renders an element?",
      options: ["v-if", "v-show", "v-for", "v-bind"],
      correctIndex: 0,
      explanation: "v-if removes the element from the DOM; v-show toggles display only." },
    { question: "Which directive binds an attribute reactively?",
      options: ["v-on", "v-model", "v-bind", "v-html"],
      correctIndex: 2,
      explanation: "v-bind (or :) binds a JS expression to an attribute." },
    { question: "How do you define reactive data in a Vue 3 component?",
      options: ["data()", "setup() + ref()", "props", "computed"],
      correctIndex: 1,
      explanation: "Vue 3 composition API uses setup() with ref() / reactive()." },
    { question: "What is the Vue instance lifecycle hook called after mount?",
      options: ["created", "mounted", "updated", "destroyed"],
      correctIndex: 1,
      explanation: "mounted() runs after the component is added to the DOM." },
    { question: "Which two-way binding directive does Vue provide?",
      options: ["v-model", "v-bind", "v-on", "v-if"],
      correctIndex: 0,
      explanation: "v-model creates two-way binding on form inputs." },
  ],
  "Node.js": [
    { question: "What is Node.js?",
      options: ["A database", "A JavaScript runtime", "A frontend framework", "An operating system"],
      correctIndex: 1,
      explanation: "Node.js executes JavaScript outside the browser using V8." },
    { question: "Which module creates an HTTP server in Node.js?",
      options: ["http", "server", "net", "url"],
      correctIndex: 0,
      explanation: "The built-in `http` module exposes createServer()." },
    { question: "What is npm?",
      options: ["Node Project Manager", "Node Package Manager", "New Package Module", "Node Programming Module"],
      correctIndex: 1,
      explanation: "npm is the Node Package Manager — the default package registry." },
    { question: "Which method reads a file asynchronously in modern Node?",
      options: ["fs.readFileSync()", "fs.readFile()", "fs.open()", "fs.read()"],
      correctIndex: 1,
      explanation: "fs.readFile (callback) or fs.promises.readFile (promise) — async vs sync." },
    { question: "Which keyword is used to import an ES module?",
      options: ["require()", "include", "import", "using"],
      correctIndex: 2,
      explanation: "ES modules use `import`; CommonJS uses require()." },
  ],
  SQL: [
    { question: "What does SQL stand for?",
      options: ["Structured Query Language", "Simple Query Language", "Standard Query Logic", "System Query Language"],
      correctIndex: 0,
      explanation: "SQL = Structured Query Language." },
    { question: "Which clause filters rows?",
      options: ["ORDER BY", "WHERE", "GROUP BY", "HAVING"],
      correctIndex: 1,
      explanation: "WHERE filters rows before grouping; HAVING filters groups." },
    { question: "What is a primary key?",
      options: ["A duplicate value", "A unique identifier", "A foreign reference", "A table name"],
      correctIndex: 1,
      explanation: "A primary key uniquely identifies each row." },
    { question: "Which join returns rows present in both tables?",
      options: ["LEFT JOIN", "RIGHT JOIN", "INNER JOIN", "FULL OUTER JOIN"],
      correctIndex: 2,
      explanation: "INNER JOIN keeps only matching rows from both sides." },
    { question: "Which command removes a table and its data?",
      options: ["DELETE", "TRUNCATE", "DROP", "REMOVE"],
      correctIndex: 2,
      explanation: "DROP TABLE removes the table definition and all data." },
  ],
  Docker: [
    { question: "What is Docker primarily used for?",
      options: ["Version control", "Containerisation", "Monitoring", "Load balancing"],
      correctIndex: 1,
      explanation: "Docker packages applications into portable containers." },
    { question: "Which command lists running containers?",
      options: ["docker ps", "docker list", "docker images", "docker status"],
      correctIndex: 0,
      explanation: "docker ps shows running containers; -a shows all." },
    { question: "Which file describes a Docker image build?",
      options: ["docker.yml", "Dockerfile", "compose.yaml", "image.cfg"],
      correctIndex: 1,
      explanation: "A Dockerfile is the canonical build script." },
    { question: "Which command pulls an image from a registry?",
      options: ["docker fetch", "docker pull", "docker get", "docker download"],
      correctIndex: 1,
      explanation: "`docker pull <image>` fetches from Docker Hub by default." },
    { question: "Which instruction sets the base image in a Dockerfile?",
      options: ["FROM", "BASE", "IMAGE", "INCLUDE"],
      correctIndex: 0,
      explanation: "`FROM image:tag` starts every Dockerfile." },
  ],
  Kubernetes: [
    { question: "What is the smallest deployable unit in Kubernetes?",
      options: ["Container", "Pod", "Node", "Cluster"],
      correctIndex: 1,
      explanation: "A Pod wraps one or more containers that share network and storage." },
    { question: "Which object provides a stable network identity?",
      options: ["Deployment", "Service", "Pod", "ConfigMap"],
      correctIndex: 1,
      explanation: "A Service gives pods a fixed virtual IP and DNS name." },
    { question: "Which command lists pods in the current namespace?",
      options: ["kubectl get pods", "kubectl pods", "kubectl list pods", "kubectl show pods"],
      correctIndex: 0,
      explanation: "`kubectl get pods` (or -A for all namespaces)." },
    { question: "Which controller manages stateless workloads?",
      options: ["StatefulSet", "Deployment", "DaemonSet", "Job"],
      correctIndex: 1,
      explanation: "Deployments manage stateless replicated pods." },
    { question: "What does a ConfigMap store?",
      options: ["Container images", "Non-confidential config data", "TLS certificates only", "Binaries"],
      correctIndex: 1,
      explanation: "ConfigMaps hold non-secret configuration." },
  ],
  AWS: [
    { question: "Which AWS service is object storage?",
      options: ["EBS", "EFS", "S3", "FSx"],
      correctIndex: 2,
      explanation: "Amazon S3 is the object storage service." },
    { question: "Which service runs code without provisioning servers?",
      options: ["EC2", "Lambda", "ECS", "Lightsail"],
      correctIndex: 1,
      explanation: "AWS Lambda runs functions in response to events." },
    { question: "Which database is AWS managed NoSQL key-value?",
      options: ["RDS", "Aurora", "DynamoDB", "Redshift"],
      correctIndex: 2,
      explanation: "DynamoDB is a managed key-value and document database." },
    { question: "Which service delivers content globally with low latency?",
      options: ["Route 53", "CloudFront", "API Gateway", "Direct Connect"],
      correctIndex: 1,
      explanation: "CloudFront is AWS's CDN." },
    { question: "Which tool manages AWS infrastructure as code?",
      options: ["CloudFormation", "CodeDeploy", "CodeBuild", "CodeStar"],
      correctIndex: 0,
      explanation: "CloudFormation (and CDK) define infra as code." },
  ],
  Figma: [
    { question: "Which Figma layer type holds vector shapes?",
      options: ["Frame", "Group", "Vector", "Text"],
      correctIndex: 2,
      explanation: "Vectors hold editable vector path data." },
    { question: "Which view restricts layers you can interact with?",
      options: ["Prototype", "Inspect", "Dev Mode", "Comment"],
      correctIndex: 2,
      explanation: "Dev Mode (formerly Inspect) gives developers read-only specs." },
    { question: "Which feature creates multiple artboards for screen designs?",
      options: ["Components", "Frames", "Variants", "Auto-layout"],
      correctIndex: 1,
      explanation: "Frames (F) are reusable artboards for screens." },
    { question: "What does Auto-layout do?",
      options: ["Locks layers", "Dynamically resizes children", "Exports assets", "Generates code"],
      correctIndex: 1,
      explanation: "Auto-layout arranges children dynamically based on rules." },
    { question: "Which shortcut creates a Frame in Figma?",
      options: ["F", "A", "R", "O"],
      correctIndex: 0,
      explanation: "Press F to create a Frame." },
  ],
  TensorFlow: [
    { question: "What is a Tensor in TensorFlow?",
      options: ["A scalar only", "An n-dimensional array", "A database row", "A graph node"],
      correctIndex: 1,
      explanation: "Tensors are n-dimensional arrays — the core data structure." },
    { question: "Which API is the high-level Keras interface in TF 2.x?",
      options: ["tf.keras", "tf.layers", "tf.estimator", "tf.contrib"],
      correctIndex: 0,
      explanation: "tf.keras is the official high-level API in TF 2.x." },
    { question: "Which loss is standard for binary classification?",
      options: ["MSE", "Binary cross-entropy", "Hinge", "Categorical CE"],
      correctIndex: 1,
      explanation: "Binary cross-entropy pairs with sigmoid output for binary tasks." },
    { question: "Which optimiser adapts learning rates per parameter?",
      options: ["SGD", "Adam", "Adagrad", "RMSProp"],
      correctIndex: 1,
      explanation: "Adam combines momentum and adaptive learning rates." },
    { question: "Which method trains a Keras model?",
      options: ["model.fit()", "model.train()", "model.run()", "model.learn()"],
      correctIndex: 0,
      explanation: "model.fit(x, y, epochs=...) trains the model." },
  ],
  PyTorch: [
    { question: "Which class is the base for all neural networks?",
      options: ["torch.Model", "torch.nn.Module", "torch.Network", "torch.Layer"],
      correctIndex: 1,
      explanation: "torch.nn.Module is the base class for models." },
    { question: "Which method performs one optimiser step?",
      options: ["optimizer.step()", "optimizer.update()", "optimizer.apply()", "optimizer.run()"],
      correctIndex: 0,
      explanation: "optimizer.step() applies the gradients after loss.backward()." },
    { question: "Which call clears previous gradients?",
      options: ["loss.reset()", "optimizer.zero_grad()", "model.zero()", "grad.clear()"],
      correctIndex: 1,
      explanation: "optimizer.zero_grad() (or model.zero_grad()) zeroes grads." },
    { question: "Which library is common for PyTorch image work?",
      options: ["torchvision", "torchaudio", "torchtext", "torcharrow"],
      correctIndex: 0,
      explanation: "torchvision provides datasets, transforms, and models for vision." },
    { question: "Which function moves a tensor to GPU?",
      options: [".to(device)", ".gpu()", ".cuda()", ".device()"],
      correctIndex: 0,
      explanation: "tensor.to('cuda' or device) moves data to GPU." },
  ],
  "C++": [
    { question: "Which keyword declares a constant in C++?",
      options: ["constant", "const", "static", "final"],
      correctIndex: 1,
      explanation: "const declares an immutable value in C++." },
    { question: "What is the output of: std::cout << 5 / 2;",
      options: ["2.5", "2", "3", "Error"],
      correctIndex: 1,
      explanation: "Integer division truncates toward zero: 5 / 2 == 2." },
    { question: "Which operator allocates memory dynamically in C++?",
      options: ["malloc", "new", "alloc", "create"],
      correctIndex: 1,
      explanation: "new allocates memory and returns a typed pointer." },
    { question: "Which header provides std::vector?",
      options: ["<array>", "<list>", "<vector>", "<deque>"],
      correctIndex: 2,
      explanation: "<vector> declares the std::vector container." },
    { question: "What does the virtual keyword enable?",
      options: ["Operator overloading", "Polymorphism", "Templates", "Inline expansion"],
      correctIndex: 1,
      explanation: "virtual enables runtime polymorphism via vtable dispatch." },
  ],
  PostgreSQL: [
    { question: "Which SQL clause filters groups after aggregation?",
      options: ["WHERE", "HAVING", "GROUP BY", "ORDER BY"],
      correctIndex: 1,
      explanation: "HAVING filters groups; WHERE filters rows before grouping." },
    { question: "What does SERIAL in PostgreSQL provide?",
      options: ["Auto-incrementing integers", "Encrypted storage", "Full-text search", "JSON validation"],
      correctIndex: 0,
      explanation: "SERIAL creates auto-incrementing integer columns." },
    { question: "Which index type supports full-text search in PostgreSQL?",
      options: ["B-tree", "GIN", "Hash", "GiST"],
      correctIndex: 1,
      explanation: "GIN indexes are optimized for full-text and array queries." },
    { question: "What is a CTEShort for?",
      options: ["Common Table Expression", "Create Table Entry Syntax", "Column Type Extension", "Compiled Transfer Encoding"],
      correctIndex: 0,
      explanation: "CTE = Common Table Expression, defined with WITH." },
    { question: "Which command creates a new database in PostgreSQL?",
      options: ["CREATE DATABASE", "NEW DATABASE", "ADD DATABASE", "INIT DATABASE"],
      correctIndex: 0,
      explanation: "CREATE DATABASE dbname; creates a new database." },
  ],
  MongoDB: [
    { question: "Which command inserts a single document in MongoDB?",
      options: ["insert()", "insertOne()", "add()", "create()"],
      correctIndex: 1,
      explanation: "insertOne() inserts one document into a collection." },
    { question: "What does the $set operator do?",
      options: ["Deletes a field", "Replaces the whole document", "Updates a field", "Creates an index"],
      correctIndex: 2,
      explanation: "$set updates the value of a field in a document." },
    { question: "Which method returns all documents in a collection?",
      options: ["find()", "search()", "get()", "all()"],
      correctIndex: 0,
      explanation: "find() with no filter returns every document." },
    { question: "What does _id default to in MongoDB?",
      options: ["A string UUID", "An ObjectId", "An auto-increment number", "The document hash"],
      correctIndex: 1,
      explanation: "MongoDB automatically generates an ObjectId for _id if not provided." },
    { question: "Which query operator selects documents where a field equals any value in an array?",
      options: ["$all", "$in", "$eq", "$nin"],
      correctIndex: 1,
      explanation: "$in matches any value in the specified array." },
  ],
  "Database Design": [
    { question: "What is the purpose of normalization?",
      options: ["Speed up queries", "Reduce redundancy and anomalies", "Encrypt data", "Increase storage"],
      correctIndex: 1,
      explanation: "Normalization reduces redundant data and update anomalies." },
    { question: "Which key uniquely identifies a row?",
      options: ["Foreign key", "Primary key", "Candidate key", "Composite key"],
      correctIndex: 1,
      explanation: "A primary key is the canonical unique row identifier." },
    { question: "What does a foreign key enforce?",
      options: ["Data encryption", "Referential integrity", "Indexing", "Partitioning"],
      correctIndex: 1,
      explanation: "Foreign keys enforce referential integrity between tables." },
    { question: "Which normal form removes transitive dependencies?",
      options: ["1NF", "2NF", "3NF", "BCNF"],
      correctIndex: 2,
      explanation: "3NF removes transitive dependencies on non-key attributes." },
    { question: "What is a surrogate key?",
      options: ["A natural business key", "An artificial unique identifier", "A composite key", "A foreign key"],
      correctIndex: 1,
      explanation: "A surrogate key is an artificial key (e.g., auto-increment ID) with no business meaning." },
  ],
  "CI/CD": [
    { question: "What does CI stand for?",
      options: ["Continuous Integration", "Code Inspection", "Centralized Issue", "Container Interface"],
      correctIndex: 0,
      explanation: "CI = Continuous Integration — merging and testing frequently." },
    { question: "Which tool is commonly used for CI/CD pipelines?",
      options: ["Docker", "Jenkins", "MongoDB", "Nginx"],
      correctIndex: 1,
      explanation: "Jenkins is a widely-used open-source CI/CD automation server." },
    { question: "What is a pipeline in CI/CD?",
      options: ["A network cable", "A defined sequence of build/test/deploy stages", "A database schema", "A load balancer"],
      correctIndex: 1,
      explanation: "A pipeline is an automated sequence of stages from commit to deploy." },
    { question: "Which practice catches bugs earliest?",
      options: ["Manual QA only", "Automated tests on every commit", "Post-release patches", "Code review only"],
      correctIndex: 1,
      explanation: "Automated CI tests run on every commit to catch regressions early." },
    { question: "What does CD stand for in CI/CD?",
      options: ["Continuous Delivery", "Code Deployment", "Central Database", "Container Distribution"],
      correctIndex: 0,
      explanation: "CD = Continuous Delivery/Deployment — automatically releasing validated changes." },
  ],
  Azure: [
    { question: "Which Azure service is managed relational database?",
      options: ["Cosmos DB", "Azure SQL Database", "Blob Storage", "Functions"],
      correctIndex: 1,
      explanation: "Azure SQL Database is the managed relational offering." },
    { question: "What is Azure Functions?",
      options: ["A SQL engine", "Serverless compute", "A CDN", "A container registry"],
      correctIndex: 1,
      explanation: "Azure Functions is serverless event-driven compute." },
    { question: "Which Azure service stores unstructured files?",
      options: ["Blob Storage", "Table Storage", "SQL Database", "Data Lake"],
      correctIndex: 0,
      explanation: "Blob Storage stores unstructured object data (files, images)." },
    { question: "What does VNet provide in Azure?",
      options: ["Serverless compute", "Isolated network environment", "Managed Kubernetes", "Object storage"],
      correctIndex: 1,
      explanation: "Azure Virtual Network provides private, isolated networking." },
    { question: "Which Azure service is a managed Kubernetes offering?",
      options: ["AKS", "VM Scale Sets", "Service Fabric", "Batch"],
      correctIndex: 0,
      explanation: "AKS = Azure Kubernetes Service, the managed Kubernetes platform." },
  ],
  "Deep Learning": [
    { question: "What is a neural network layer?",
      options: ["A database table", "A set of neurons applying weighted transformations", "An API endpoint", "A file system path"],
      correctIndex: 1,
      explanation: "Layers apply weighted transformations to propagate signals forward." },
    { question: "Which function introduces non-linearity in neural networks?",
      options: ["Linear layer", "Activation function (ReLU/Sigmoid)", "Loss function", "Optimizer"],
      correctIndex: 1,
      explanation: "Activation functions like ReLU introduce non-linearity." },
    { question: "What is backpropagation?",
      options: ["Forward inference", "Gradient computation to update weights", "Data augmentation", "Model deployment"],
      correctIndex: 1,
      explanation: "Backpropagation computes gradients and updates weights via the chain rule." },
    { question: "Which architecture is fundamental for image classification?",
      options: ["RNN", "CNN", "Transformer", "GAN"],
      correctIndex: 1,
      explanation: "CNNs (Convolutional Neural Networks) excel at image tasks." },
    { question: "What does dropout do during training?",
      options: ["Scales inputs", "Randomly disables neurons to prevent overfitting", "Normalizes batches", "Reduces learning rate"],
      correctIndex: 1,
      explanation: "Dropout randomly zeros neuron outputs during training to reduce overfitting." },
  ],
  "Generative AI": [
    { question: "What is a Generative Adversarial Network (GAN)?",
      options: ["A classifier", "Two networks competing to generate realistic data", "A reinforcement learner", "A search algorithm"],
      correctIndex: 1,
      explanation: "GANs pit a generator against a discriminator to produce realistic data." },
    { question: "Which model is known for text generation?",
      options: ["ResNet", "GPT", "YOLO", "Random Forest"],
      correctIndex: 1,
      explanation: "GPT (Generative Pre-trained Transformer) is a leading text generation model." },
    { question: "What is diffusion in generative models?",
      options: ["A data compression technique", "Gradual denoising to generate data", "A type of optimizer", "An activation function"],
      correctIndex: 1,
      explanation: "Diffusion models generate data by reversing a gradual noising process." },
    { question: "What is the purpose of a latent space in generative models?",
      options: ["Store labels", "Compressed representation for generation", "Hold gradients", "Cache predictions"],
      correctIndex: 1,
      explanation: "Latent space is a compressed representation from which new samples are generated." },
    { question: "Which metric evaluates generative image quality?",
      options: ["Accuracy", "FID score", "BLEU", "RMSE"],
      correctIndex: 1,
      explanation: "FID (Fréchet Inception Distance) compares real vs generated distributions." },
  ],
  LLMs: [
    { question: "What does LLM stand for?",
      options: ["Large Language Model", "Local Logic Module", "Long-term Learning Memory", "Layered Linear Model"],
      correctIndex: 0,
      explanation: "LLM = Large Language Model, trained on vast text corpora." },
    { question: "What is a transformer in LLMs?",
      options: ["An electrical component", "An attention-based neural architecture", "A data loader", "An optimizer"],
      correctIndex: 1,
      explanation: "Transformers use self-attention to process sequences in parallel." },
    { question: "What is tokenization?",
      options: ["Model pruning", "Splitting text into subword units for the model", "Gradient clipping", "Weight quantization"],
      correctIndex: 1,
      explanation: "Tokenization converts raw text into the discrete units an LLM processes." },
    { question: "What is fine-tuning an LLM?",
      options: ["Deleting layers", "Continued training on a smaller task-specific dataset", "Changing the tokenizer", "Quantizing weights"],
      correctIndex: 1,
      explanation: "Fine-tuning adapts a pre-trained LLM to a specific task or domain." },
    { question: "What is hallucination in LLMs?",
      options: ["A model crash", "Generating plausible but incorrect or unsupported text", "Overfitting to training data", "Low inference speed"],
      correctIndex: 1,
      explanation: "Hallucination is when an LLM produces confident but incorrect content." },
  ],
  RAG: [
    { question: "What does RAG stand for?",
      options: ["Random Access Generator", "Retrieval-Augmented Generation", "Reinforced Attention Gate", "Recursive Algorithm Graph"],
      correctIndex: 1,
      explanation: "RAG = Retrieval-Augmented Generation — fetches external knowledge before generating." },
    { question: "What is the retriever in RAG?",
      options: ["The language model", "The component that fetches relevant documents", "The database index", "The API gateway"],
      correctIndex: 1,
      explanation: "The retriever searches a knowledge base for relevant context." },
    { question: "Why use RAG instead of only fine-tuning?",
      options: ["It is always faster", "It grounds answers in up-to-date external data", "It removes hallucinations entirely", "It requires less compute"],
      correctIndex: 1,
      explanation: "RAG grounds outputs in retrieved documents, keeping answers current without retraining." },
    { question: "What is a vector database used for in RAG?",
      options: ["Storing passwords", "Storing embeddings for similarity search", "Running SQL queries", "Hosting the LLM"],
      correctIndex: 1,
      explanation: "Vector databases store embeddings so semantically similar chunks can be retrieved." },
    { question: "Which metric is commonly used for embedding similarity?",
      options: ["Manhattan distance", "Cosine similarity", "Hamming distance", "Jaccard index"],
      correctIndex: 1,
      explanation: "Cosine similarity measures the angle between embedding vectors." },
  ],
  "AI Agents": [
    { question: "What is an AI agent?",
      options: ["A static model", "An autonomous system that perceives and acts toward goals", "A database trigger", "A load balancer"],
      correctIndex: 1,
      explanation: "AI agents autonomously perceive, reason, and act to achieve objectives." },
    { question: "What is tool use in AI agents?",
      options: ["A hardware sensor", "Calling external APIs/functions to extend capabilities", "Model quantization", "Data cleaning"],
      correctIndex: 1,
      explanation: "Tool use lets agents call external functions like search, code execution, or APIs." },
    { question: "What is an agent loop?",
      options: ["A training epoch", "Observe-reason-act cycle repeated until done", "A gradient step", "A data pipeline"],
      correctIndex: 1,
      explanation: "The agent loop cycles through perception, reasoning, and action." },
    { question: "What is memory in AI agents?",
      options: ["RAM usage", "Storing past interactions/state for future decisions", "Model weights", "Disk cache"],
      correctIndex: 1,
      explanation: "Agent memory stores history/state to inform future actions." },
    { question: "What is a common framework for building AI agents?",
      options: ["React", "LangChain", "Docker", "PostgreSQL"],
      correctIndex: 1,
      explanation: "LangChain provides abstractions for agent loops, memory, and tool use." },
  ],
  "Prompt Engineering": [
    { question: "What is prompt engineering?",
      options: ["Writing database schemas", "Crafting inputs to reliably steer LLM outputs", "Compiling code", "Configuring networks"],
      correctIndex: 1,
      explanation: "Prompt engineering designs inputs to get desired, consistent outputs from LLMs." },
    { question: "What is a system prompt?",
      options: ["An OS boot message", "Hidden instructions that set model behavior", "A debugging log", "A user message"],
      correctIndex: 1,
      explanation: "System prompts define the model's role, tone, and constraints." },
    { question: "What is few-shot prompting?",
      options: ["Training with only one example", "Providing a few examples in the prompt to guide the model", "Fine-tuning on 3 samples", "Using a small model"],
      correctIndex: 1,
      explanation: "Few-shot prompting includes examples in the prompt to steer behavior." },
    { question: "What is chain-of-thought prompting?",
      options: ["Chaining multiple models", "Asking the model to show step-by-step reasoning", "Connecting APIs", "Sequential fine-tuning"],
      correctIndex: 1,
      explanation: "Chain-of-thought elicits intermediate reasoning steps to improve accuracy." },
    { question: "Why constrain LLM output format?",
      options: ["To make it slower", "To ensure parseable, structured results", "To reduce token cost only", "To hide errors"],
      correctIndex: 1,
      explanation: "Format constraints make outputs machine-readable and consistent." },
  ],
  "Cyber Security": [
    { question: "What is the CIA triad?",
      options: ["Central Intelligence Agency", "Confidentiality, Integrity, Availability", "Code, Interface, API", "Control, Input, Access"],
      correctIndex: 1,
      explanation: "CIA = Confidentiality, Integrity, Availability — core security goals." },
    { question: "What is phishing?",
      options: ["A network scanning tool", "Social engineering to steal credentials", "A firewall rule", "An encryption standard"],
      correctIndex: 1,
      explanation: "Phishing tricks users into revealing sensitive data via fake communications." },
    { question: "What does a firewall do?",
      options: ["Encrypts emails", "Filters network traffic based on rules", "Stores passwords", "Scans for malware"],
      correctIndex: 1,
      explanation: "Firewalls filter inbound/outbound traffic per security rules." },
    { question: "What is a zero-day vulnerability?",
      options: ["A bug fixed on day zero", "A vulnerability with no available patch", "A new antivirus", "A scheduled maintenance window"],
      correctIndex: 1,
      explanation: "Zero-days are vulnerabilities exploited before a fix exists." },
    { question: "What is MFA?",
      options: ["Multi-Factor Authentication", "Mainframe File Access", "Media Format Analyzer", "Managed Firewall Agent"],
      correctIndex: 0,
      explanation: "MFA requires two or more verification factors to authenticate." },
  ],
  Blockchain: [
    { question: "What is a blockchain?",
      options: ["A centralized database", "A distributed immutable ledger", "A cloud storage system", "A SQL extension"],
      correctIndex: 1,
      explanation: "Blockchain is a distributed, append-only ledger secured by cryptography." },
    { question: "What is a smart contract?",
      options: ["A legal PDF", "Self-executing code on a blockchain", "A cloud function", "A database trigger"],
      correctIndex: 1,
      explanation: "Smart contracts are programs that execute automatically when conditions are met." },
    { question: "What is consensus in blockchain?",
      options: ["A user agreement dialog", "Mechanism for nodes to agree on ledger state", "A hashing algorithm", "A wallet feature"],
      correctIndex: 1,
      explanation: "Consensus mechanisms (PoW, PoS, etc.) let distributed nodes agree on state." },
    { question: "What is a block?",
      options: ["A single transaction", "A batch of transactions with a hash linking to the previous block", "A smart contract", "A node ID"],
      correctIndex: 1,
      explanation: "Blocks group transactions and cryptographically chain to the prior block." },
    { question: "What does Web3 emphasize?",
      options: ["Centralized services", "Decentralized, user-owned internet", "Web 2.0 advertising", "Client-side rendering"],
      correctIndex: 1,
      explanation: "Web3 envisions a decentralized internet where users own their data and identity." },
  ],
  "Requirements Engineering": [
    { question: "What is a functional requirement?",
      options: ["A server spec", "A behavior the system must exhibit", "A network cable", "A database index"],
      correctIndex: 1,
      explanation: "Functional requirements describe what the system should do." },
    { question: "What is a non-functional requirement?",
      options: ["A deprecated feature", "A quality attribute like performance or security", "A user interface bug", "A hardware constraint"],
      correctIndex: 1,
      explanation: "Non-functional requirements define quality attributes: performance, security, reliability." },
    { question: "What is a use case?",
      options: ["A hardware test", "A description of system interaction to achieve a goal", "A deployment script", "A database schema"],
      correctIndex: 1,
      explanation: "Use cases capture interactions between actors and the system to achieve goals." },
    { question: "What is a user story?",
      options: ["A marketing biography", "A short requirement from the user's perspective", "A database migration", "A network diagram"],
      correctIndex: 1,
      explanation: "User stories are short, user-centric requirement descriptions." },
    { question: "What is requirement traceability?",
      options: ["Network latency", "Linking requirements to design, code, and tests", "Memory profiling", "Log analysis"],
      correctIndex: 1,
      explanation: "Traceability tracks requirements through design, implementation, and testing." },
  ],
  Documentation: [
    { question: "What is API documentation?",
      options: ["A database schema", "A description of how to use an API", "A deployment script", "A unit test"],
      correctIndex: 1,
      explanation: "API documentation explains endpoints, parameters, and responses." },
    { question: "What is a README?",
      options: ["A compiled binary", "A project overview and setup guide", "A log file", "A configuration key"],
      correctIndex: 1,
      explanation: "A README provides project context, setup steps, and usage examples." },
    { question: "What is inline documentation?",
      options: ["A README file", "Comments within source code explaining logic", "A changelog", "An API spec"],
      correctIndex: 1,
      explanation: "Inline comments explain code logic directly where it is written." },
    { question: "What is a changelog?",
      options: ["A database backup", "A chronological record of project changes", "A network log", "A test report"],
      correctIndex: 1,
      explanation: "A changelog documents versioned changes, fixes, and additions." },
    { question: "Why keep documentation updated?",
      options: ["To increase file size", "To ensure users and developers have accurate guidance", "To slow down development", "To hide architecture"],
      correctIndex: 1,
      explanation: "Updated documentation prevents confusion and reduces onboarding friction." },
  ],
};

// Category fallback → pick from these when no exact skill match
const CATEGORY_FALLBACK = {
  Frontend: "JavaScript",
  Backend:  "Node.js",
  DevOps:   "Docker",
  Design:   "Figma",
  "AI / ML": "TensorFlow",
  Testing:  "JavaScript",
  "Full Stack": "JavaScript",
  "C++": "Python",
  PostgreSQL: "SQL",
  MongoDB: "SQL",
  "Database Design": "SQL",
  "CI/CD": "Docker",
  Azure: "AWS",
  Automation: "JavaScript",
  "UI/UX": "Figma",
  "Deep Learning": "TensorFlow",
  "Generative AI": "TensorFlow",
  LLMs: "TensorFlow",
  RAG: "TensorFlow",
  "AI Agents": "TensorFlow",
  "Prompt Engineering": "TensorFlow",
  LLMOps: "TensorFlow",
  "Context Engineering": "TensorFlow",
  "Multimodal AI": "TensorFlow",
  "Model Evaluation": "TensorFlow",
  "Cyber Security": "JavaScript",
  "Network Security": "Cyber Security",
  "Secure Coding": "Cyber Security",
  Authentication: "Cyber Security",
  Cryptography: "Cyber Security",
  Blockchain: "JavaScript",
  Web3: "Blockchain",
  "Smart Contracts": "Blockchain",
  "Requirements Engineering": "JavaScript",
  Documentation: "JavaScript",
};

// Normalise input → pick the right bank
function bankForSkill(raw) {
  const skill = String(raw || "").trim();
  if (QUESTION_BANK[skill]) return QUESTION_BANK[skill];
  // Try title-case variations
  const tc = skill
    .split(/[\s/]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
  if (QUESTION_BANK[tc]) return QUESTION_BANK[tc];
  // Loose contains
  const key = Object.keys(QUESTION_BANK).find(
    (k) => k.toLowerCase() === skill.toLowerCase()
  );
  if (key) return QUESTION_BANK[key];
  // Category fallback
  for (const [cat, def] of Object.entries(CATEGORY_FALLBACK)) {
    if (skill.toLowerCase().includes(cat.toLowerCase())) return QUESTION_BANK[def];
  }
  // Last resort: JavaScript
  return QUESTION_BANK.JavaScript;
}

// Validate an AI-generated quiz structure
function validateQuiz(quiz) {
  if (!quiz || typeof quiz !== "object") return false;
  const qs = Array.isArray(quiz.questions) ? quiz.questions : null;
  if (!qs || qs.length !== 5) return false;
  for (const q of qs) {
    if (!q || typeof q.question !== "string" || !q.question.trim()) return false;
    if (!Array.isArray(q.options) || q.options.length !== 4) return false;
    if (q.options.some((o) => typeof o !== "string" || !o.trim())) return false;
    if (typeof q.correctIndex !== "number" || q.correctIndex < 0 || q.correctIndex > 3) return false;
  }
  return true;
}

// Try the (optional) AI path. Never throws or blocks.
async function tryGenerateAI(skill, difficulty) {
  try {
    const { omniRouteGenerate } = await import("../services/omniRoute.js");
    const result = await omniRouteGenerate({
      prompt:
        `Generate exactly 5 multiple-choice questions for ${skill} at ${difficulty} level. ` +
        `Return strict JSON: { "questions": [ { "question": "...", "options": ["A","B","C","D"], "correctIndex": 0-3, "explanation": "..." } ] }`,
      responseFormat: "json_object",
      maxTokens: 1500,
    });
    let parsed = null;
    if (typeof result?.content === "string") {
      try {
        const clean = result.content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
        parsed = JSON.parse(clean);
      } catch {}
    }
    parsed = parsed || result?.data;
    if (validateQuiz(parsed)) return parsed;
  } catch {
    // swallow — fallback below
  }
  return null;
}

// ── POST /api/ai/quiz/generate ─────────────────────────────────────────────────
router.post("/ai/quiz/generate", requireAuth, async (req, res) => {
  try {
    const { skill, difficulty = "intermediate" } = req.body ?? {};
    if (!skill || !String(skill).trim()) {
      return res.status(400).json({ error: "Skill is required." });
    }
    const skillKey = String(skill).trim();

    // 1. Try AI (optional)
    const ai = await tryGenerateAI(skillKey, difficulty);
    if (ai) {
      const quiz = {
        skill: skillKey,
        difficulty,
        questionCount: 5,
        questions: ai.questions.map((q, i) => ({
          index: i,
          question: q.question,
          options: q.options,
          correctIndex: q.correctIndex,
          explanation: q.explanation || "Correct answer.",
        })),
        source: "ai",
      };
      return res.json({ success: true, quiz });
    }

    // 2. Deterministic fallback (always works)
    const bank = bankForSkill(skillKey);
    const shuffled = [...bank].sort(() => Math.random() - 0.5).slice(0, 5);
    const quiz = {
      skill: skillKey,
      difficulty,
      questionCount: 5,
      questions: shuffled.map((q, i) => ({
        index: i,
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation || "",
      })),
      source: "fallback",
    };
    res.json({ success: true, quiz });
  } catch (e) {
    res.status(500).json({ error: "We couldn't generate your quiz right now. Please try again." });
  }
});

// ── POST /api/ai/quiz/submit ──────────────────────────────────────────────────
// FIX 5F: Verification threshold = 3 / 5 (NOT 80%).
router.post("/ai/quiz/submit", requireAuth, async (req, res) => {
  try {
    const authUser = await resolveAuthUser(req.user);
    if (!authUser) return res.status(401).json({ error: "Unauthorized" });

    const { skill, answers, difficulty, questions } = req.body ?? {};
    if (!skill || !Array.isArray(answers)) {
      return res.status(400).json({ error: "Skill and answers array are required." });
    }
    if (answers.length !== 5) {
      return res.status(400).json({ error: "Quiz must have exactly 5 answers." });
    }
    const skillKey = String(skill).trim();
    const bank = bankForSkill(skillKey);

    // Scoring: prefer questions array if provided, otherwise fallback to static bank.
    let correct = 0;
    const detail = [];
    for (let i = 0; i < 5; i++) {
      const a = answers[i];
      const q = questions && questions[i];
      const expected = typeof q?.correctIndex === "number" ? q.correctIndex : (bank[i]?.correctIndex ?? -1);
      const ok = typeof a === "number" && a === expected;
      if (ok) correct++;
      detail.push({
        questionIndex: i,
        questionText: q?.question || bank[i]?.question || "",
        userAnswer: a,
        correctIndex: expected,
        correct: ok,
        explanation: q?.explanation || bank[i]?.explanation || "",
      });
    }
    const verified = correct >= 3;
    res.json({
      success: true,
      result: {
        skill: skillKey,
        score: correct,
        total: 5,
        verified,
        threshold: 3,
        difficulty: difficulty || "intermediate",
        detail,
      },
    });
  } catch (e) {
    res.status(500).json({ error: "We couldn't score your quiz right now. Please try again." });
  }
});

export default router;