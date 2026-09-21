class UserProfile {
  constructor() {
    this.name = 'Marine';
    this.cls = 'marine';
    this.points = 0;
    this.highestLevelCompleted = 0;
    this.load();
  }

  load() {
    const data = localStorage.getItem('air-swarm-profile');
    if (data) {
      try {
        const parsed = JSON.parse(data);
        this.name = parsed.name || 'Marine';
        this.cls = parsed.cls || 'marine';
        this.points = Number.isFinite(parsed.points) ? parsed.points : 0;
        this.highestLevelCompleted = Number.isInteger(parsed.highestLevelCompleted) ? parsed.highestLevelCompleted : 0;
      } catch (e) {
        // use default properties on parse failure
      }
    }
  }

  save() {
    localStorage.setItem('air-swarm-profile', JSON.stringify({
      name: this.name,
      cls: this.cls,
      points: this.points,
      highestLevelCompleted: this.highestLevelCompleted,
    }));
  }
}

export const profile = new UserProfile();
export default profile;
