const express = require("express");
const app = express();
const cors = require("cors");

const { config } = require("dotenv");
config();

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL + "?sslmode=require",
});

const uploadMiddleware = require("./middlewares/uploadMiddleware");
const uploadImageMiddleware = require("./middlewares/uploadImageMiddleware");
const fs = require("fs");
const { get } = require("http");

const http = require("http").Server(app);

const socketIO = require("socket.io")(http, {
  cors: {
    origin: "http://localhost:3000",
  },
});

// middleware
app.use(cors());
app.use(express.json());

// static files
app.use("/images", express.static("images"));

// socet io

socketIO.on("connection", (socket) => {
  console.log(`⚡: ${socket.id} user just connected!`);

  //Listens and logs the message to the console
  socket.on("message", (data) => {
    console.log(data);
    socketIO.emit("messageResponse", data);
  });

  socket.on("disconnect", () => {
    console.log("🔥: A user disconnected");
  });
});

//Routes

// create chatroom

app.post("/chats", async (req, res) => {
  console.log(req.body);
  try {
    const { users } = req.body;
    if (users.length === 0) {
      res.status(404).json({ message: "No users selected" });
    } else if (users.length === 2) {
      const checkChat = await pool.query(
        "SELECT * FROM chatrooms WHERE name = $1",
        [users.join(",")]
      );
      if (checkChat.rows.length !== 0) {
        res.json(checkChat.rows[0]);
      } else {
        const newChat = await pool.query(
          "INSERT INTO chatrooms(name) VALUES ($1) RETURNING *",
          [users.join(",")]
        );
        let result = { ...newChat.rows[0], members: [] };

        for (const user of users) {
          console.log(user);
          const newChatUser = await pool.query(
            "INSERT INTO users_chatrooms(chatroom_id, user_id) VALUES ($1, (select id from users where username = $2))",
            [newChat.rows[0].id, user]
          );
          const userInfo = await pool.query(
            "select * from users where username = $1",
            [user]
          );
          result.members.push(userInfo.rows[0]);
        }
        console.log(result);
        res.json(result);
      }
    }
  } catch (error) {
    console.error(error.message);
  }
});

// store message

app.post("/messages", async (req, res) => {
  try {
    const { chatroom_id, sender_id, text, date } = req.body;
    const newMessage = await pool.query(
      "INSERT INTO messages(chatroom_id, sender_id, text, date) VALUES ($1,$2,$3,$4) RETURNING *",
      [chatroom_id, sender_id, text, date]
    );
    res.json(newMessage.rows[0]);
  } catch (error) {
    console.error(error.message);
  }
});

// get chatroom messages

app.post("/chats/messages", async (req, res) => {
  try {
    const { chatID, userID } = req.body;
    const messages = await pool.query(
      "SELECT * FROM messages WHERE chatroom_id = $1",
      [chatID]
    );
    res.json(messages.rows);
  } catch (error) {
    console.error(error.message);
  }
});

// get chatrooms where user is a member

app.get("/user_chatrooms/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;
    const userChatrooms = await pool.query(
      "select c.* from chatrooms c inner join users_chatrooms uc on c.id = uc.chatroom_id where uc.user_id = $1;",
      [user_id]
    );

    for (let index = 0; index < userChatrooms.rows.length; index++) {
      const chatroomMembers = await pool.query(
        "select u.* from users_chatrooms inner join users u on u.id = users_chatrooms.user_id where chatroom_id = $1 and u.id != $2",
        [userChatrooms.rows[index].id, user_id]
      );
      userChatrooms.rows[index] = {
        ...userChatrooms.rows[index],
        members: chatroomMembers.rows,
      };
    }

    res.json(userChatrooms.rows);
  } catch (error) {
    console.error(error.message);
  }
});

// auth a user

app.post("/users/auth", async (req, res) => {
  try {
    const { user_email, user_password } = req.body;
    const checkUser = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND password = $2",
      [user_email, user_password]
    );
    console.log(checkUser.rows);
    if (checkUser.rows.length === 0) {
      res.status(404).json({ message: "User not found" });
    } else {
      res.json(checkUser.rows[0]);
      //   res.json(checkUser.rows[0]);
    }
  } catch (error) {
    console.error(error.message);
  }
});

//create a user
app.post("/users", async (req, res) => {
  try {
    const { user_email, username, user_password, admin } = req.body;
    const userEmailUnique = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [user_email]
    );
    const userNameUnique = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );
    if (userEmailUnique.rows.length !== 0) {
      res.status(404).json({ message: "Email already exist" });
    } else if (userNameUnique.rows.length !== 0) {
      res.status(404).json({ message: "Username already exist" });
    } else {
      const newUser = await pool.query(
        "INSERT INTO users(email,username,password,admin) VALUES ($1,$2,$3, $4) RETURNING *",
        [user_email, username, user_password, admin]
      );

      res.json(newUser.rows[0]);
    }
  } catch (error) {
    console.error(error.message);
  }
});

// update a user

app.put("/users/:user_id", uploadImageMiddleware, async (req, res) => {
  try {
    const { user_id } = req.params;
    const { username, email, currentPassword, newPassword } = req.body;

    console.log(req.body);

    const imageName = req.file.filename;
    const user = await pool.query("SELECT * FROM users WHERE id = $1", [
      user_id,
    ]);

    if (user.rows.length === 0) {
      res.status(404).json({ message: "User not found" });
    } else {
      if (currentPassword !== user.rows[0].password) {
        res.status(404).json({ message: "Incorrect password" });
      } else {
        const updatedUser = await pool.query(
          "UPDATE users SET username = $1, email = $2, password = $3, avatar_name = $4 WHERE id = $5 RETURNING *",
          [username, email, newPassword, imageName, user_id]
        );
        res.json(updatedUser.rows[0]);
      }
    }
  } catch (error) {
    console.error(error.message);
  }
});

// update a user

// get all users

app.get("/users", async (req, res) => {
  try {
    const users = await pool.query("select username, avatar_name from users");
    res.json(users.rows);
  } catch (error) {
    console.error(error.message);
  }
});

// add project
app.post("/projects", async (req, res) => {
  try {
    const { name, description, date_created, date_due, category, members } =
      req.body;
    const newProject = await pool.query(
      "INSERT INTO projects(name, description, date_created, date_due, category) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [name, description, date_created, date_due, category]
    );

    const project_id = newProject.rows[0].id;

    for (let i = 0; i < members.length; i++) {
      const newMember = await pool.query(
        "insert into projects_members(project_id, user_id, user_role) values ($1,(select id from users where username = $2 ), $3);",
        [project_id, members[i].username, members[i].role]
      );
    }
    res.json(newProject.rows[0]);
  } catch (error) {
    console.error(error.message);
  }
});

// get projects where user is a member
app.get("/user_projects/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;
    const userProjects = await pool.query(
      "select p.* from projects p inner join projects_members pm on p.id = pm.project_id where pm.user_id = $1;",
      [user_id]
    );

    for (let index = 0; index < userProjects.rows.length; index++) {
      const projectMembers = await pool.query(
        "select u.*, projects_members.user_role  from projects_members inner join users u on u.id = projects_members.user_id where project_id = $1",
        [userProjects.rows[index].id]
      );
      userProjects.rows[index] = {
        ...userProjects.rows[index],
        members: projectMembers.rows,
      };
    }

    res.json(userProjects.rows);
  } catch (error) {
    console.error(error.message);
  }
});

// create a task

app.post("/tasks", uploadMiddleware, async (req, res) => {
  console.log(5 / 0);
  try {
    const files = req.files;
    const {
      name,
      description,
      status,
      date_created,
      projectName,
      subtasks,
      members,
    } = req.body;

    console.log(req.body);

    const newTask = await pool.query(
      "insert into   tasks(name, description, status, project_id, date_created) values ($1,$2,$3, (select p.id from projects p where p.name = $4) , $5) RETURNING id",
      [name, description, status, projectName, date_created]
    );

    const task_id = newTask.rows[0].id;

    for (let index = 0; index < members.length; index++) {
      const newTaskMember = await pool.query(
        "insert into tasks_members(task_id, user_id) values ($1, (select id from users where username = $2))",
        [task_id, members[index]]
      );
    }

    const parsedSubtasks = JSON.parse(subtasks);

    console.log(parsedSubtasks);

    for (let index = 0; index < parsedSubtasks.length; index++) {
      const newSubtask = await pool.query(
        "insert into subtasks(text, completed, task_id) values ($1,$2,$3)",
        [parsedSubtasks[index].title, parsedSubtasks[index].completed, task_id]
      );
    }

    for (let index = 0; index < files.length; index++) {
      const newFile = await pool.query(
        "insert into attachments(file_name, file_source_name, task_id) values ($1,$2,$3)",
        [files[index].originalname, files[index].filename, task_id]
      );
    }

    res.status(200).json({ message: "Task adding successful" });
  } catch (error) {
    console.error(error.message);
  }
});

// get tasks where user is a member

app.get("/user_tasks/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;

    const userTasks = await pool.query(
      "select t.* from tasks t inner join tasks_members tm on t.id = tm.task_id where tm.user_id = $1;",
      [user_id]
    );

    // count members in tasks
    for (let index = 0; index < userTasks.rows.length; index++) {
      const taskMembers = await pool.query(
        "select count(*) from tasks_members where task_id = $1",
        [userTasks.rows[index].id]
      );
      userTasks.rows[index] = {
        ...userTasks.rows[index],
        members_count: parseInt(taskMembers.rows[0].count),
      };
    }

    // count subtasks in tasks

    for (let index = 0; index < userTasks.rows.length; index++) {
      const taskSubtasks = await pool.query(
        "select count(*) from subtasks where task_id = $1",
        [userTasks.rows[index].id]
      );
      userTasks.rows[index] = {
        ...userTasks.rows[index],
        subtasks_count: parseInt(taskSubtasks.rows[0].count),
      };
    }

    // count attachmetns in tasks
    for (let index = 0; index < userTasks.rows.length; index++) {
      const taskAttachments = await pool.query(
        "select count(*) from attachments where task_id = $1",
        [userTasks.rows[index].id]
      );
      userTasks.rows[index] = {
        ...userTasks.rows[index],
        attachments_count: parseInt(taskAttachments.rows[0].count),
      };
    }

    // get project name
    for (let index = 0; index < userTasks.rows.length; index++) {
      const taskProject = await pool.query(
        "select p.name from projects p inner join tasks t on p.id = t.project_id where t.id = $1",
        [userTasks.rows[index].id]
      );
      userTasks.rows[index] = {
        ...userTasks.rows[index],
        project_name: taskProject.rows[0].name,
      };
    }

    res.json(userTasks.rows);
  } catch (error) {
    console.error(error.message);
  }
});

// get task by id
app.get("/task/:task_id", async (req, res) => {
  try {
    const { task_id } = req.params;

    const task = await pool.query("select * from tasks where id = $1", [
      task_id,
    ]);

    const taskMembers = await pool.query(
      "select u.* from tasks_members inner join users u on u.id = tasks_members.user_id where task_id = $1",
      [task_id]
    );

    const taskSubtasks = await pool.query(
      "select * from subtasks where task_id = $1",
      [task_id]
    );

    const taskAttachments = await pool.query(
      "select * from attachments where task_id = $1",
      [task_id]
    );
    // project name

    const taskProject = await pool.query(
      "select p.name from projects p inner join tasks t on p.id = t.project_id where t.id = $1",
      [task_id]
    );

    res.json({
      ...task.rows[0],
      members: taskMembers.rows,
      subtasks: taskSubtasks.rows,
      attachments: taskAttachments.rows,
      project_name: taskProject.rows[0].name,
    });
  } catch (error) {
    console.error(error.message);
  }
});

// update task status

app.put("/task/:task_id", async (req, res) => {
  try {
    const { task_id } = req.params;
    const { status } = req.body;

    const updatedTask = await pool.query(
      "update tasks set status = $1 where id = $2 RETURNING *",
      [status, task_id]
    );

    res.json(updatedTask.rows[0]);
  } catch (error) {
    console.error(error.message);
  }
});

// download attachment file by name

app.get("/attachments/:file_name", async (req, res) => {
  try {
    const { file_name } = req.params;
    const file = await pool.query(
      "select * from attachments where file_source_name = $1",
      [file_name]
    );
    const fileSource = `${__dirname}/attachments/${file_name}`;
    res.download(fileSource, file.rows[0].file_name);
  } catch (error) {
    console.error(error.message);
  }
});

// delete task
app.delete("/task/:task_id", async (req, res) => {
  try {
    const { task_id } = req.params;

    const task = await pool.query("select * from tasks where id = $1", [
      task_id,
    ]);

    const taskAttachments = await pool.query(
      "select * from attachments where task_id = $1",
      [task_id]
    );

    const taskSubtasks = await pool.query(
      "select * from subtasks where task_id = $1",
      [task_id]
    );

    for (let index = 0; index < taskAttachments.rows.length; index++) {
      const fileSource = `${__dirname}/attachments/${taskAttachments.rows[index].file_source_name}`;
      fs.unlinkSync(fileSource);
    }

    const deletedTask = await pool.query("delete from tasks where id = $1", [
      task_id,
    ]);

    res.json(deletedTask.rows[0]);
  } catch (error) {
    console.error(error.message);
  }
});

http.listen(5000, () => {
  console.log("listening on port 5000");
});
