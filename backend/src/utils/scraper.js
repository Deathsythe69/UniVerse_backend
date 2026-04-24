const axios = require("axios");
const cheerio = require("cheerio");
const Event = require("../models/Event");

const scrapeBPUT = async () => {
  try {
    const url = "https://www.bput.ac.in"; // Adjust as needed
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    let events = [];

    // Extracting news links, adjusting selector for bput
    $(".news li, .marquee p").each((i, el) => {
      const title = $(el).text().trim();
      const link = $(el).find("a").attr("href") || url;

      if (title && title.length > 5) {
        events.push({ 
          title: `[BPUT Notification] ${title}`,
          description: `Official Notification from BPUT. Link: ${link}`,
          type: "seminar", 
          date: new Date(), 
          location: "BPUT Online", 
          organizer: "BPUT" 
        });
      }
    });

    // Add mock exams as well since we don't have BPUT API
    const currentMonth = new Date().getMonth();
    if (currentMonth > 3 && currentMonth < 6) { // near may
      events.push({
        title: "Even Semester Examinations",
        description: "BPUT Scheduled Even Semester Exams for all departments.",
        type: "other",
        date: new Date(new Date().setMonth(currentMonth + 1)),
        location: "Respective Centers",
        organizer: "BPUT"
      });
    }

    // Save new events (avoid duplicates)
    for (let ev of events) {
      const exists = await Event.findOne({ title: ev.title });
      if (!exists) {
        await Event.create(ev);
      }
    }
    
    console.log("🔥 BPUT Events updated automatically");

  } catch (error) {
    console.log("Scraper error:", error.message);
  }
};

module.exports = scrapeBPUT;
