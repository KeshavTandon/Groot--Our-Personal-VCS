#!/usr/bin/env node
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { diffLines } from "diff";
import chalk from "chalk";
import { Command } from "commander";

const program = new Command();

class Groot {
  constructor(repoPath = ".") {
    this.repoPath = path.join(repoPath, ".groot");
    this.objectsPath = path.join(this.repoPath, "objects"); //.groot/objects
    this.headPath = path.join(this.repoPath, "HEAD"); //.groot/objects
    this.indexPath = path.join(this.repoPath, "index"); //.groot/index
    this.init();
  }

  async init() {
    await fs.mkdir(this.objectsPath, { recursive: true });
    try {
      await fs.writeFile(this.headPath, "", { flag: "wx" }); //wx means if the file doesnt exits then it will create else it will throw an error
      await fs.writeFile(this.indexPath, JSON.stringify([]), { flag: "wx" });
    } catch (error) {
      console.log("Already initialised the .groot folder");
    }
  }

  hashObject(contentToBeHashed) {
    return crypto
      .createHash("sha1")
      .update(contentToBeHashed, "utf-8")
      .digest("hex");
  }

  async add(fileToBeHashed) {
    const fileData = await fs.readFile(fileToBeHashed, { encoding: "utf-8" }); //reading the file
    const fileHash = this.hashObject(fileData);
    console.log(fileHash);
    const newFileHashedObjectPath = path.join(this.objectsPath, fileHash);
    await fs.writeFile(newFileHashedObjectPath, fileData);
    //add it to staging area
    await this.updateStagingArea(fileToBeHashed, fileHash);
    console.log(`Added ${fileToBeHashed}`);
  }

  async updateStagingArea(filePath, fileHash) {
    const index = JSON.parse(
      await fs.readFile(this.indexPath, { encoding: "utf-8" })
    ); //read the index file
    index.push({ path: filePath, hash: fileHash });
    await fs.writeFile(this.indexPath, JSON.stringify(index)); //writing the updated index
  }

  async commit(message) {
    //Staging area -> final
    const index = JSON.parse(
      await fs.readFile(this.indexPath, { encoding: "utf-8" })
    ); //reading the index file to get all content of staging area
    const parentCommit = await this.getCurrentHead(); //getting the last commit id

    const commitData = {
      timeStamp: new Date().toISOString(),
      message,
      files: index,
      parent: parentCommit,
    };

    const commitHash = this.hashObject(JSON.stringify(commitData)); //generating the hash of commitData
    const commitPath = path.join(this.objectsPath, commitHash); //adding commitHash as a new file in objects
    await fs.writeFile(commitPath, JSON.stringify(commitData)); //writing in the file
    await fs.writeFile(this.headPath, commitHash); //updating the head pointer
    await fs.writeFile(this.indexPath, JSON.stringify([])); //clearing the staging area
    console.log(`Commit Successfully with ${commitHash}`);
  }

  async getCurrentHead() {
    try {
      return await fs.readFile(this.headPath, { encoding: "utf-8" }); //getting the last commit
    } catch (error) {
      return null;
    }
  }

  async log() {
    let currentCommitHash = await this.getCurrentHead();
    while (currentCommitHash) {
      const commitData = JSON.parse(
        await fs.readFile(path.join(this.objectsPath, currentCommitHash), {
          encoding: "utf-8",
        })
      );
      console.log(`---------------------\n`);
      console.log(
        `Commit: ${currentCommitHash}\nDate: ${commitData.timeStamp}\n\n${commitData.message}\n\n`
      );

      currentCommitHash = commitData.parent;
    }
  }

  async showCommitDiff(commitHash) {
    const commitData = JSON.parse(await this.getCommitData(commitHash));
    if (!commitData) {
      console.log("Commit not found");
      return;
    }
    console.log("Changes in the last commit are: ");

    for (const file of commitData.files) {
      console.log(`File: ${file.path}`);
      const fileContent = await this.getFileContent(file.hash);
      console.log(fileContent);

      if (commitData.parent) {
        // get the parent commit data
        const parentCommitData = JSON.parse(
          await this.getCommitData(commitData.parent)
        );
        const getParentFileContent = await this.getParentFileContent(
          parentCommitData,
          file.path
        );
        if (getParentFileContent !== undefined) {
          console.log("\nDiff:");
          const diff = diffLines(getParentFileContent, fileContent);

          // console.log(diff);

          diff.forEach((part) => {
            if (part.added) {
              process.stdout.write(chalk.green("++" + part.value));
            } else if (part.removed) {
              process.stdout.write(chalk.red("--" + part.value));
            } else {
              process.stdout.write(chalk.grey(part.value));
            }
          });
          console.log(); // new line
        } else {
          console.log("New file in this commit");
        }
      } else {
        console.log("First commit");
      }
    }
  }

  async getParentFileContent(parentCommitData, filePath) {
    const parentFile = parentCommitData.files.find(
      (file) => file.path === filePath
    );
    if (parentFile) {
      // get the file content from the parent commit and return the content
      return await this.getFileContent(parentFile.hash);
    }
  }

  async getCommitData(commithash) {
    const commitPath = path.join(this.objectsPath, commithash);
    try {
      return await fs.readFile(commitPath, { encoding: "utf-8" });
    } catch (error) {
      console.log("Failed to read the commit data", error);
      return null;
    }
  }

  async getFileContent(fileHash) {
    const objectPath = path.join(this.objectsPath, fileHash);
    return fs.readFile(objectPath, { encoding: "utf-8" });
  }
}

// (async () => {
//   const groot = new Groot();
//   // await groot.add("sample.txt");
//   // await groot.commit("4th Commit");
//   // await groot.log();
//   groot.showCommitDiff("c1d1c2dd1859e07a6a77819739660944ecf3f6f3");
// })();

program.command("init").action(async () => {
  const groot = new Groot();
});

program.command("add <file>").action(async (file) => {
  const groot = new Groot();
  await groot.add(file);
});

program.command("commit <message>").action(async (message) => {
  const groot = new Groot();
  await groot.commit(message);
});

program.command("log").action(async () => {
  const groot = new Groot();
  await groot.log();
});

program.command("show <commitHash>").action(async (commitHash) => {
  const groot = new Groot();
  await groot.showCommitDiff(commitHash);
});

program.parse(process.argv);
